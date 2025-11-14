from ..base import EvaluationPlugin, EvaluationContext, EvaluationResult
from ..registry import register_plugin


class ExactMatchEvaluation(EvaluationPlugin):
    """
    An evaluation that performs an exact string match between the output and the answer column.
    
    Returns 1 if the output exactly matches the answer, 0 otherwise.
    """
    
    name = "exact_match"
    description = "Compares output to the answer column. Returns 1 if exact match, 0 otherwise."
    
    def run(self, context: EvaluationContext) -> EvaluationResult:
        """
        Compare output to answer column with exact string matching.
        
        Args:
            context: Evaluation context containing the row data, output, and optional config
            
        Returns:
            EvaluationResult with score of 1 (match) or 0 (no match)
        """
        # Get answer column name from config, default to "answer"
        answer_column = "answer"
        if context.config and "answer_column" in context.config:
            answer_column = str(context.config["answer_column"])
        
        # Get the expected answer from the row data
        if answer_column not in context.row:
            return EvaluationResult(
                score=0,
                details={
                    "reason": f"Answer column '{answer_column}' not found in row data",
                    "available_columns": list(context.row.keys())
                }
            )
        
        expected_answer = context.row[answer_column]
        
        # Handle None or empty cases
        if context.output is None:
            context.output = ""
        if expected_answer is None:
            expected_answer = ""
        
        # Convert both to strings for comparison
        output_str = str(context.output).strip()
        expected_str = str(expected_answer).strip()
        
        # Perform exact match comparison
        is_match = output_str == expected_str
        
        return EvaluationResult(
            score=1 if is_match else 0,
            details={
                "expected": expected_str,
                "output": output_str,
                "match": is_match,
                "answer_column": answer_column
            }
        )


# Register this plugin when the module is imported
register_plugin(ExactMatchEvaluation)

