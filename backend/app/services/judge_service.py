"""Service for running judge evaluations."""
from typing import Dict, Any, List, Optional, Tuple
from app.services.llm_service import llm_service
from app.models.judge import JudgeConfig

async def run_judge_evaluation(
    judge_config: JudgeConfig,
    row_data: Dict[str, Any],
    output: str,
    available_columns: List[str]
) -> Tuple[float, str]:
    """
    Run a judge evaluation on a specific output.
    
    Args:
        judge_config: The judge configuration
        row_data: The original row data
        output: The output to evaluate
        available_columns: List of available columns in the row data
        
    Returns:
        Tuple containing (score, raw_output)
        
    Raises:
        ValueError: If the prompt template is invalid or score cannot be parsed
        Exception: If the LLM call fails
    """
    # Add output to row data and available columns for the prompt template
    row_data_with_output = dict(row_data)
    row_data_with_output["Output"] = output
    
    available_cols_with_output = list(available_columns)
    if "Output" not in available_cols_with_output:
        available_cols_with_output.append("Output")
    
    # Build the complete judge prompt
    complete_prompt = llm_service.build_judge_prompt(
        judge_config.prompt,
        row_data_with_output,
        available_cols_with_output
    )
    
    # Get completion from LLM
    raw_output = await llm_service.completion(
        complete_prompt,
        model=judge_config.model,
        temperature=judge_config.temperature,
        max_completion_tokens=judge_config.max_tokens
    )
    
    if not raw_output or not raw_output.strip():
        raise ValueError("LLM returned empty output")
        
    # Parse the score
    score = llm_service.parse_judge_score(raw_output)
    
    return score, raw_output

