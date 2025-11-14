"""GEPA (Reflective Prompt Evolution) optimization service"""
import random
import asyncio
from concurrent.futures import ThreadPoolExecutor
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
from app.models.evaluation import Evaluation
from app.models.judge import JudgeConfig
from app.models.function_eval import FunctionEvalConfig
from app.services.llm_service import llm_service
from app.services.function_eval_service import run_function_evaluation
from app.utils import parse_json_safe, get_root_prompt_id, get_next_prompt_version


def _run_async_sync(coro):
    """Helper to run async code from sync context, handling existing event loops"""
    try:
        loop = asyncio.get_running_loop()
        # We're in an async context with a running loop
        # Use a thread pool to run the coroutine
        import concurrent.futures
        with ThreadPoolExecutor() as executor:
            future = executor.submit(asyncio.run, coro)
            return future.result()
    except RuntimeError:
        # No running loop, safe to use asyncio.run
        return asyncio.run(coro)


class EvalsBackedAdapter:
    """
    Adapter for GEPA that integrates with Evaluizer's evaluation system.
    Mirrors EvalsBackedSummarizationAdapter from the cookbook.
    """
    
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
        generator_max_tokens: int = 2000
    ):
        self.db = db
        self.gepa_config = gepa_config
        self.csv_file = csv_file
        self.available_columns = available_columns
        self.judge_configs = judge_configs
        self.function_eval_configs = function_eval_configs
        self.generator_model = generator_model
        self.generator_temperature = generator_temperature
        self.generator_max_tokens = generator_max_tokens
        self.reflection_model = gepa_config.reflection_model
        
        # Use GEPA's default reflection with template preservation instruction
        self.propose_new_texts = self._propose_new_texts_with_template_preservation
    
    def _build_template_preservation_instructions(self) -> str:
        """Build instructions for preserving template variables"""
        return "CRITICAL: Preserve all {{column_name}} template variables exactly as shown - they are placeholders that will be replaced with actual data."
    
    def _propose_new_texts_with_template_preservation(
        self,
        candidate: Dict[str, str],
        reflective_dataset: Dict[str, List[Dict[str, Any]]],
        components_to_update: List[str]
    ) -> Dict[str, str]:
        """
        Propose new candidate prompts using default meta prompt with template preservation.
        
        Args:
            candidate: Current candidate with "system_prompt" key
            reflective_dataset: Dataset from make_reflective_dataset
            components_to_update: List of component names to update
            
        Returns:
            Dictionary with updated components (e.g., {"system_prompt": "new prompt"})
        """
        current_prompt = candidate.get("system_prompt", "")
        examples = reflective_dataset.get("system_prompt", [])
        
        # Build feedback summary from examples
        feedback_parts = []
        scores = []
        for example in examples:
            feedback = example.get("Feedback", "")
            if feedback:
                feedback_parts.append(feedback)
            metrics = example.get("metrics", {})
            if "combined" in metrics:
                scores.append(metrics["combined"])
        
        feedback_summary = "\n".join(feedback_parts) if feedback_parts else "No specific feedback available."
        
        if scores:
            avg_score = sum(scores) / len(scores)
            feedback_summary = f"Average score: {avg_score:.3f}\n\n{feedback_summary}"
        
        # Use GEPA's default reflection prompt structure with template preservation instruction
        template_instruction = self._build_template_preservation_instructions()
        
        # GEPA's default reflection prompt (simplified version)
        meta_prompt = f"""{template_instruction}

Current prompt:
{current_prompt}

Feedback:
{feedback_summary}

Generate an improved version of the prompt."""
        
        # Call reflection model to generate improved prompt (run async synchronously)
        reflection_output = _run_async_sync(llm_service.completion(
            meta_prompt,
            model=self.reflection_model,
            temperature=1.0,  # Default temperature for reflection
            max_completion_tokens=16384  # Default max tokens for reflection
        ))
        
        # Extract and validate the new prompt
        new_prompt = self._extract_and_validate_prompt(reflection_output, current_prompt)
        
        return {"system_prompt": new_prompt}
    
    def _extract_and_validate_prompt(self, reflection_output: str, original_prompt: str) -> str:
        """
        Extract prompt from reflection output and validate template variables are preserved.
        
        Args:
            reflection_output: Raw output from reflection model
            original_prompt: Original prompt to extract template variables from
            
        Returns:
            Extracted and validated prompt
        """
        import re
        
        # Extract the new prompt from the reflection output
        new_prompt = reflection_output.strip()
        
        # Remove markdown code blocks if present
        if new_prompt.startswith("```"):
            lines = new_prompt.split("\n")
            if len(lines) > 1:
                new_prompt = "\n".join(lines[1:-1]) if lines[-1].strip() == "```" else "\n".join(lines[1:])
        
        # Remove quotes if wrapped
        if (new_prompt.startswith('"') and new_prompt.endswith('"')) or \
           (new_prompt.startswith("'") and new_prompt.endswith("'")):
            new_prompt = new_prompt[1:-1]
        
        new_prompt = new_prompt.strip()
        
        return new_prompt
    
    async def _generate_output(self, system_prompt: str, row_data: Dict[str, Any]) -> str:
        """Generate output using the system prompt and row data"""
        # Render the prompt template with row data
        rendered_prompt = llm_service.render_prompt(system_prompt, row_data, self.available_columns)
        
        # Generate output
        output = await llm_service.completion(
            rendered_prompt,
            model=self.generator_model,
            temperature=self.generator_temperature,
            max_completion_tokens=self.generator_max_tokens
        )
        
        return output.strip()
    
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
        scores: List[float] = []
        outputs: List[str] = []
        trajectories: List[Dict[str, Any]] = []
        
        for item in inputs:
            row_data = item.get("row_data", {})
            csv_row_id = item.get("csv_row_id")
            
            # 1) Generate output with the candidate prompt
            try:
                # Run async method synchronously
                summary = _run_async_sync(self._generate_output(system_prompt, row_data))
                outputs.append(summary)
            except Exception as e:
                # If generation fails, score as 0
                outputs.append("")
                scores.append(0.0)
                if capture_traces:
                    trajectories.append({
                        "inputs": {"row_data": row_data},
                        "generated_output": "",
                        "metrics": {"combined": 0.0},
                        "feedback": f"Generation failed: {str(e)}"
                    })
                continue
            
            # 2) Grade using judge configs and function eval configs
            grader_scores: Dict[str, float] = {}
            all_scores: List[float] = []
            feedback_parts: List[str] = []
            
            # Run judge configs
            for judge_config in self.judge_configs:
                try:
                    row_data_with_output = dict(row_data)
                    row_data_with_output["Output"] = summary
                    
                    complete_prompt = llm_service.build_judge_prompt(
                        judge_config.prompt,
                        row_data_with_output,
                        self.available_columns + ["Output"]
                    )
                    
                    # Run async LLM call synchronously
                    judge_output = _run_async_sync(llm_service.completion(
                        complete_prompt,
                        model=judge_config.model,
                        temperature=judge_config.temperature,
                        max_completion_tokens=judge_config.max_tokens
                    ))
                    
                    score = llm_service.parse_judge_score(judge_output)
                    grader_scores[f"judge_{judge_config.name}"] = score
                    all_scores.append(score)
                    feedback_parts.append(f"{judge_config.name}: {score:.3f}")
                except Exception as e:
                    score = 0.0
                    grader_scores[f"judge_{judge_config.name}"] = score
                    all_scores.append(score)
                    feedback_parts.append(f"{judge_config.name}: failed ({str(e)})")
            
            # Run function eval configs
            for function_eval_config in self.function_eval_configs:
                try:
                    result_dict = run_function_evaluation(
                        name=function_eval_config.function_name,
                        row=row_data,
                        output=summary,
                        config=function_eval_config.config
                    )
                    score = float(result_dict["score"])
                    grader_scores[f"function_{function_eval_config.name}"] = score
                    all_scores.append(score)
                    feedback_parts.append(f"{function_eval_config.name}: {score:.3f}")
                except Exception as e:
                    score = 0.0
                    grader_scores[f"function_{function_eval_config.name}"] = score
                    all_scores.append(score)
                    feedback_parts.append(f"{function_eval_config.name}: failed ({str(e)})")
            
            # 3) Calculate combined score (average of all scores)
            if all_scores:
                scalar = sum(all_scores) / len(all_scores)
            else:
                scalar = 0.0
            
            scores.append(float(scalar))
            
            # 4) Collect feedback
            feedback = "; ".join(feedback_parts) if feedback_parts else "All graders passed; keep precision and coverage."
            
            if capture_traces:
                trajectories.append({
                    "inputs": {"row_data": row_data, "csv_row_id": csv_row_id},
                    "generated_output": summary,
                    "metrics": {
                        "combined": float(scalar),
                        "by_grader": grader_scores
                    },
                    "feedback": feedback
                })
        
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
    
    seed_prompt_content = base_prompt.content
    
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
    
    # Create train/val split (90/10)
    random.shuffle(all_rows)
    val_cut = max(1, int(0.1 * len(all_rows)))
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
    adapter = EvalsBackedAdapter(
        db=db,
        gepa_config=gepa_config,
        csv_file=csv_file,
        available_columns=available_columns,
        judge_configs=judge_configs,
        function_eval_configs=function_eval_configs,
        generator_model=gepa_config.generator_model,
        generator_temperature=1.0,
        generator_max_tokens=2000
    )
    
    # Seed candidate
    seed_candidate = {"system_prompt": seed_prompt_content}
    
    # Run GEPA optimization
    result = gepa.optimize(
        seed_candidate=seed_candidate,
        trainset=trainset,
        valset=valset,
        adapter=adapter,
        reflection_lm=gepa_config.reflection_model,
        max_metric_calls=gepa_config.max_metric_calls,
        track_best_outputs=True,
        display_progress_bar=False  # We'll handle progress ourselves
    )
    
    # Get best prompt
    best_prompt = result.best_candidate.get("system_prompt", "")
    
    # Validate that we got a prompt
    if not best_prompt or not best_prompt.strip():
        raise ValueError("GEPA optimization did not produce a valid prompt")
    
    # Calculate best score from validation set
    val_batch = adapter.evaluate(valset, result.best_candidate, capture_traces=False)
    best_score = sum(val_batch.scores) / len(val_batch.scores) if val_batch.scores else 0.0
    
    # Create new prompt version (base_prompt_id is always required now)
    root_prompt_id = get_root_prompt_id(db, gepa_config.base_prompt_id)
    
    # Get the root prompt to inherit its name
    root_prompt = db.query(Prompt).filter(Prompt.id == root_prompt_id).first()
    if not root_prompt:
        raise ValueError(f"Root prompt {root_prompt_id} not found")
    
    version = get_next_prompt_version(db, root_prompt_id)
    
    new_prompt = Prompt(
        name=root_prompt.name,  # Inherit name from root prompt
        content=best_prompt.strip(),  # Ensure content is trimmed
        csv_file_id=csv_file_id,
        parent_prompt_id=root_prompt_id,
        version=version,
        commit_message=f"GEPA optimized via {gepa_config.name}"
    )
    db.add(new_prompt)
    db.commit()
    db.refresh(new_prompt)
    
    new_prompt_id = new_prompt.id
    
    return {
        "best_prompt": best_prompt,
        "new_prompt_id": new_prompt_id,
        "score": best_score,
        "logs": f"Optimization completed. Best score: {best_score:.3f}"
    }

