"""GEPA (Reflective Prompt Evolution) optimization service"""
# Apply nest_asyncio to allow nested event loops (needed for LiteLLM compatibility)
import nest_asyncio
nest_asyncio.apply()

import random
import asyncio
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session

try:
    import gepa
    from gepa import EvaluationBatch
except ImportError:
    raise ImportError("gepa package not installed. Install it with: pip install gepa")

from app.models.gepa import GepaConfig
from app.models.prompt import Prompt
from app.models.csv_data import CSVFile, CSVRow
from app.models.judge import JudgeConfig
from app.models.function_eval import FunctionEvalConfig
from app.services.llm_service import llm_service
from app.services.function_eval_service import run_function_evaluation
from app.services.judge_service import run_judge_evaluation
from app.services.gepa_progress import update_progress, set_complete, set_error, clear_progress
from app.utils import parse_json_safe, get_root_prompt_id, get_next_prompt_version


class EvalsBackedAdapter:
    """
    Minimal adapter for GEPA that integrates with Evaluizer's evaluation system.
    Mirrors EvalsBackedSummarizationAdapter from OpenAI's cookbook.
    
    Key methods:
      - evaluate(...) -> EvaluationBatch (scores + outputs + feedback-rich trajectories)
      - get_components_to_update(...) returns the prompt to update
      - make_reflective_dataset(...) packages examples for reflection
    """
    
    # Use GEPA's default reflection flow (like OpenAI's example)
    propose_new_texts = None
    
    def __init__(
        self,
        db: Session,
        gepa_config: GepaConfig,
        csv_file: CSVFile,
        available_columns: List[str],
        judge_configs: List[JudgeConfig],
        function_eval_configs: List[FunctionEvalConfig],
        generator_model: str,
        generator_temperature: float = 1.0,
        generator_max_tokens: int = 2000,
        user_message_column: Optional[str] = None
    ):
        self.db = db
        self.gepa_config = gepa_config
        self.csv_file = csv_file
        self.available_columns = available_columns
        self.judge_configs = judge_configs
        self.function_eval_configs = function_eval_configs
        self.generator_model = generator_model
        self.generator_temperature = float(generator_temperature) if generator_temperature is not None else 1.0
        self.generator_max_tokens = int(generator_max_tokens) if generator_max_tokens is not None and generator_max_tokens > 0 else 2000
        
        self.user_message_column = user_message_column
        self.config_id = gepa_config.id
        self._evaluation_count = 0
        
    def _run_async(self, coro):
        """
        Run async coroutine synchronously from sync context.
        
        Since nest_asyncio is applied at thread start, we can use run_until_complete
        on the existing event loop. This keeps LiteLLM's queues bound to the same loop.
        """
        try:
            # Get the running event loop (we're inside asyncio.run() in thread)
            loop = asyncio.get_running_loop()
            # nest_asyncio was applied at thread start, so this works
            return loop.run_until_complete(coro)
        except RuntimeError:
            # No running loop - safe to use asyncio.run() directly
            return asyncio.run(coro)
    
    async def _generate_output(self, system_prompt: str, row_data: Dict[str, Any], user_message_column: Optional[str] = None) -> str:
        """Generate output using the system prompt and row data with chat format"""
        try:
            # Render the system prompt template with row data
            rendered_system_prompt = llm_service.render_prompt(system_prompt, row_data, self.available_columns)
            if not rendered_system_prompt or not rendered_system_prompt.strip():
                raise ValueError(f"Rendered system prompt is empty. Original prompt: {system_prompt[:100]}...")
            
            # Get user message from the specified column if provided
            user_message = ""
            if user_message_column:
                if user_message_column not in self.available_columns:
                    raise ValueError(f"User message column '{user_message_column}' not found in available columns")
                user_message = str(row_data.get(user_message_column, ""))
                if not user_message.strip():
                    raise ValueError(f"User message column '{user_message_column}' is empty for this row")
            
            # Use chat completion with system and user messages
            output = await llm_service.chat_completion(
                system_prompt=rendered_system_prompt,
                user_message=user_message,
                model=self.generator_model,
                temperature=self.generator_temperature,
                max_completion_tokens=self.generator_max_tokens
            )
            
            if not output:
                raise ValueError(f"LLM returned empty output for system prompt: {rendered_system_prompt[:200]}...")
            
            return output.strip()
        except Exception as e:
            raise
    
    async def _evaluate_single_item(
        self,
        item: Dict[str, Any],
        system_prompt: str,
        capture_traces: bool
    ) -> tuple[str, float, Dict[str, Any], str]:
        """Evaluate a single input item asynchronously"""
        row_data = item.get("row_data", {})
        csv_row_id = item.get("csv_row_id")
        
        # 1) Generate output
        try:
            summary = await self._generate_output(system_prompt, row_data, self.user_message_column)
            if not summary or not summary.strip():
                return "", 0.0, {}, "Generation returned empty output"
        except Exception as e:
            import traceback
            error_msg = f"Generation failed: {str(e)}\n{traceback.format_exc()}"
            return "", 0.0, {}, error_msg
        
        # 2) Grade using judge configs and function eval configs
        grader_scores: Dict[str, float] = {}
        all_scores: List[float] = []
        feedback_parts: List[str] = []
        
        # Run judge configs in parallel
        async def evaluate_judge(judge_config):
            """Evaluate a single judge config"""
            try:
                score, _ = await run_judge_evaluation(
                    judge_config,
                    row_data,
                    summary,
                    self.available_columns
                )
                return f"judge_{judge_config.name}", score, f"{judge_config.name}: {score:.3f}"
            except Exception as e:
                import traceback
                error_detail = f"{str(e)}"
                return f"judge_{judge_config.name}", 0.0, f"{judge_config.name}: failed ({error_detail})"
        
        # Wait for all judge evaluations in parallel
        if self.judge_configs:
            judge_tasks = [evaluate_judge(jc) for jc in self.judge_configs]
            judge_results = await asyncio.gather(*judge_tasks)
            for key, score, feedback in judge_results:
                grader_scores[key] = score
                all_scores.append(score)
                feedback_parts.append(feedback)
        
        # Run function eval configs (synchronous, but fast)
        for function_eval_config in self.function_eval_configs:
            try:
                result_dict = run_function_evaluation(
                    name=function_eval_config.function_name,
                    row=row_data,
                    output=summary,
                    config=function_eval_config.config
                )
                if "score" not in result_dict:
                    raise ValueError(f"No score in result: {result_dict}")
                score = float(result_dict["score"])
                grader_scores[f"function_{function_eval_config.name}"] = score
                all_scores.append(score)
                feedback_parts.append(f"{function_eval_config.name}: {score:.3f}")
            except Exception as e:
                import traceback
                error_detail = f"{str(e)}"
                score = 0.0
                grader_scores[f"function_{function_eval_config.name}"] = score
                all_scores.append(score)
                feedback_parts.append(f"{function_eval_config.name}: failed ({error_detail})")
        
        # 3) Calculate combined score
        scalar = sum(all_scores) / len(all_scores) if all_scores else 0.0
        feedback = "; ".join(feedback_parts) if feedback_parts else "All graders passed; keep precision and coverage."
        
        trajectory = {
            "inputs": {"row_data": row_data, "csv_row_id": csv_row_id},
            "generated_output": summary,
            "metrics": {
                "combined": float(scalar),
                "by_grader": grader_scores
            },
            "feedback": feedback
        } if capture_traces else {}
        
        return summary, float(scalar), trajectory, feedback
    
    def evaluate(
        self,
        inputs: List[Dict[str, Any]],
        candidate: Dict[str, str],
        capture_traces: bool = True
    ) -> EvaluationBatch:
        """
        Evaluate a candidate prompt on the inputs.
        
        Args:
            inputs: List of input dictionaries (each contains row data)
            candidate: Dictionary with "system_prompt" key
            capture_traces: Whether to capture detailed trajectories
            
        Returns:
            EvaluationBatch with scores, outputs, and trajectories
        """
        system_prompt = candidate["system_prompt"]
        
        # Update progress: starting evaluation
        self._evaluation_count += 1
        update_progress(
            self.config_id,
            message=f"Evaluating candidate {self._evaluation_count} on {len(inputs)} examples...",
            current_iteration=self._evaluation_count
        )
        
        # Evaluate all items (using async batching for efficiency)
        async def evaluate_all():
            tasks = [
                self._evaluate_single_item(item, system_prompt, capture_traces)
                for item in inputs
            ]
            return await asyncio.gather(*tasks)
        
        results = self._run_async(evaluate_all())
        
        # Unpack results and calculate scores
        scores: List[float] = []
        outputs: List[str] = []
        trajectories: List[Dict[str, Any]] = []
        
        # Collect feedback for debugging
        all_feedback = []
        for idx, (output, score, trajectory, feedback) in enumerate(results):
            outputs.append(output)
            scores.append(score)
            if feedback:
                all_feedback.append(feedback)
            if capture_traces and trajectory:
                trajectories.append(trajectory)
        
        # Update progress with final results
        avg_score = sum(scores) / len(scores) if scores else 0.0
        
        # If all scores are 0, include feedback in progress message
        if avg_score == 0.0 and all_feedback:
            feedback_summary = "; ".join(all_feedback[:3])  # First 3 feedback items
            update_progress(
                self.config_id,
                current_score=avg_score,
                message=f"Completed evaluation of {len(inputs)} examples (avg score: {avg_score:.3f}). Issues: {feedback_summary[:200]}..."
            )
        else:
            update_progress(
                self.config_id,
                current_score=avg_score,
                message=f"Completed evaluation of {len(inputs)} examples (avg score: {avg_score:.3f})"
            )
        
        return EvaluationBatch(scores=scores, outputs=outputs, trajectories=trajectories)
    
    def get_components_to_update(self, candidate: Dict[str, str]) -> List[str]:
        """Return the text fields GEPA should evolve"""
        return ["system_prompt"]
    
    def make_reflective_dataset(
        self,
        candidate: Dict[str, str],
        eval_batch: EvaluationBatch,
        components_to_update: List[str]
    ) -> Dict[str, List[Dict[str, Any]]]:
        """Build the reflective dataset for GEPA reflection"""
        examples = []
        for traj in (eval_batch.trajectories or []):
            examples.append({
                "Inputs": traj.get("inputs", {}),
                "Generated Outputs": traj.get("generated_output", ""),
                "Feedback": traj.get("feedback", "")
            })
        return {"system_prompt": examples}


async def run_gepa(
    db: Session,
    gepa_config: GepaConfig,
    csv_file_id: int
) -> Dict[str, Any]:
    """
    Run GEPA optimization for a config.
    
    Args:
        db: Database session
        gepa_config: GEPA configuration
        csv_file_id: CSV file ID
        
    Returns:
        Dictionary with best_prompt, new_prompt_id, score, and logs
    """
    config_id = gepa_config.id
    
    # Initialize progress BEFORE doing any work
    clear_progress(config_id)
    update_progress(
        config_id,
        status="running",
        current_iteration=0,
        max_iterations=gepa_config.max_metric_calls,
        message="Starting GEPA optimization..."
    )
    
    # Get CSV file and columns
    csv_file = db.query(CSVFile).filter(CSVFile.id == csv_file_id).first()
    if not csv_file:
        raise ValueError(f"CSV file {csv_file_id} not found")
    
    available_columns = parse_json_safe(csv_file.columns, [])
    
    # Get base prompt (required for meaningful optimization)
    if not gepa_config.base_prompt_id:
        raise ValueError("Base prompt is required for GEPA optimization. Please select a prompt to optimize.")
    
    base_prompt = db.query(Prompt).filter(Prompt.id == gepa_config.base_prompt_id).first()
    if not base_prompt:
        raise ValueError(f"Base prompt {gepa_config.base_prompt_id} not found")
    
    if not base_prompt.system_prompt:
        raise ValueError(f"Base prompt {gepa_config.base_prompt_id} has no system_prompt")
    
    seed_prompt_content = base_prompt.system_prompt
    
    user_message_column = base_prompt.user_message_column
    
    # Get judge configs
    judge_configs = []
    if gepa_config.judge_config_ids:
        judge_configs = db.query(JudgeConfig).filter(
            JudgeConfig.id.in_(gepa_config.judge_config_ids)
        ).all()
    
    # Get function eval configs
    function_eval_configs = []
    if gepa_config.function_eval_config_ids:
        function_eval_configs = db.query(FunctionEvalConfig).filter(
            FunctionEvalConfig.id.in_(gepa_config.function_eval_config_ids)
        ).all()
    
    if not judge_configs and not function_eval_configs:
        raise ValueError("At least one judge config or function eval config must be provided")
    
    # Get all rows for train/val split
    all_rows = db.query(CSVRow).filter(CSVRow.csv_file_id == csv_file_id).all()
    if not all_rows:
        raise ValueError(f"No rows found for CSV file {csv_file_id}")
    
    # Create train/val split (80/20)
    random.shuffle(all_rows)
    val_cut = max(1, int(0.2 * len(all_rows)))
    valset_rows = all_rows[:val_cut]
    trainset_rows = all_rows[val_cut:]
    
    # Prepare trainset and valset in the format GEPA expects
    trainset = []
    for row in trainset_rows:
        row_data = parse_json_safe(row.row_data, {})
        trainset.append({
            "row_data": row_data,
            "csv_row_id": row.id
        })
    
    valset = []
    for row in valset_rows:
        row_data = parse_json_safe(row.row_data, {})
        valset.append({
            "row_data": row_data,
            "csv_row_id": row.id
        })
    
    # Create adapter
    # Handle migration: fallback to old fields if new fields don't exist (for backward compatibility)
    generator_temp = getattr(gepa_config, 'generator_temperature', None) or getattr(gepa_config, 'temperature', 1.0)
    generator_tokens = getattr(gepa_config, 'generator_max_tokens', None) or getattr(gepa_config, 'max_completion_tokens', 16384)
    
    adapter = EvalsBackedAdapter(
        db=db,
        gepa_config=gepa_config,
        csv_file=csv_file,
        available_columns=available_columns,
        judge_configs=judge_configs,
        function_eval_configs=function_eval_configs,
        generator_model=gepa_config.generator_model,
        generator_temperature=generator_temp,
        generator_max_tokens=generator_tokens,
        user_message_column=user_message_column
    )
    
    # Seed candidate with template preservation instruction if needed
    # GEPA's default reflection will handle this, but we can add a note to the prompt
    seed_candidate = {"system_prompt": seed_prompt_content}
    
    try:
        update_progress(
            config_id,
            message=f"Running optimization (max {gepa_config.max_metric_calls} iterations)..."
        )
        
        # Run GEPA optimization (using GEPA's default reflection)
        result = gepa.optimize(
            seed_candidate=seed_candidate,
            trainset=trainset,
            valset=valset,
            adapter=adapter,
            reflection_lm=gepa_config.reflection_model,
            max_metric_calls=gepa_config.max_metric_calls,
            track_best_outputs=True,
            display_progress_bar=False  # We handle progress ourselves
        )
        
        # Try to get the best prompt from result.best_candidate
        # Also check result.candidate as a fallback (current candidate)
        best_prompt = ""
        if hasattr(result, 'best_candidate') and result.best_candidate:
            best_prompt = result.best_candidate.get("system_prompt", "")
        
        # If best_candidate doesn't have it, try candidate (current/last candidate)
        if not best_prompt and hasattr(result, 'candidate') and result.candidate:
            best_prompt = result.candidate.get("system_prompt", "")
        
        # If still no prompt, raise error
        if not best_prompt:
            raise ValueError("GEPA optimization did not produce a valid prompt - could not find system_prompt in result")
        
        # Validate that we got a prompt
        if not best_prompt or not best_prompt.strip():
            raise ValueError("GEPA optimization did not produce a valid prompt")
        
        update_progress(
            config_id,
            message="Calculating final validation score..."
        )
        
        # Calculate best score from validation set
        val_batch = adapter.evaluate(valset, result.best_candidate, capture_traces=False)
        best_score = sum(val_batch.scores) / len(val_batch.scores) if val_batch.scores else 0.0
        
        update_progress(
            config_id,
            best_score=best_score,
            message=f"Final validation score: {best_score:.3f}"
        )
        
    except Exception as e:
        set_error(config_id, f"Optimization failed: {str(e)}")
        raise
    
    # Create new prompt version (base_prompt_id is always required now)
    root_prompt_id = get_root_prompt_id(db, gepa_config.base_prompt_id)
    
    # Get the root prompt to inherit its name
    root_prompt = db.query(Prompt).filter(Prompt.id == root_prompt_id).first()
    if not root_prompt:
        raise ValueError(f"Root prompt {root_prompt_id} not found")
    
    version = get_next_prompt_version(db, root_prompt_id)
    
    # Ensure we have the optimized prompt content (use best_prompt from GEPA result)
    # Do NOT use seed_prompt_content here - we want the optimized version
    # best_prompt should already be validated and non-empty at this point
    optimized_content = best_prompt.strip()
    
    new_prompt = Prompt(
        name=root_prompt.name,  # Inherit name from root prompt
        system_prompt=optimized_content,  # Save the optimized system prompt (NOT seed_prompt_content)
        user_message_column=user_message_column,  # Inherit user message column from base prompt
        csv_file_id=csv_file_id,
        parent_prompt_id=root_prompt_id,
        version=version,
        commit_message=f"GEPA optimized via {gepa_config.name} (eval score: {best_score:.3f})"
    )
    
    try:
        db.add(new_prompt)
        db.commit()
        db.refresh(new_prompt)
    except Exception as e:
        db.rollback()
        raise ValueError(f"Failed to save optimized prompt to database: {str(e)}")
    
    # Verify the content was saved correctly
    new_prompt_id = new_prompt.id
    saved_prompt = db.query(Prompt).filter(Prompt.id == new_prompt_id).first()
    if not saved_prompt:
        raise ValueError("Failed to retrieve saved prompt from database")
    
    if saved_prompt.system_prompt != optimized_content:
        raise ValueError("Failed to save optimized prompt content correctly - content mismatch detected")
    
    # Mark as complete
    set_complete(
        config_id,
        best_score,
        f"Optimization completed. Best score: {best_score:.3f}. Created prompt version {version}.",
        new_prompt_id=new_prompt_id
    )
    
    return {
        "best_prompt": best_prompt,
        "new_prompt_id": new_prompt_id,
        "score": best_score,
        "logs": f"Optimization completed. Best score: {best_score:.3f}"
    }
