from ..base import EvaluationPlugin, EvaluationContext, EvaluationResult
from ..registry import register_plugin


class OutputLengthEvaluation(EvaluationPlugin):
    """
    A simple example evaluation that scores outputs based on their length.
    
    This is a demonstration plugin showing how to create a function-based evaluation.
    It returns a score from 0-1 based on output length, with longer outputs scoring higher
    (up to a maximum threshold).
    """
    
    name = "output_length"
    description = "Scores outputs based on their character length (0-1 scale)"
    
    def run(self, context: EvaluationContext) -> EvaluationResult:
        """
        Calculate a score based on output length.
        
        Args:
            context: Evaluation context containing the output to evaluate
            
        Returns:
            EvaluationResult with score between 0 and 1
        """
        if context.output is None or context.output.strip() == "":
            return EvaluationResult(
                score=0.0,
                details={"reason": "Output is empty or None"}
            )
        
        # Get max length from config, default to 1000 characters
        max_length = 1000
        if context.config and "max_length" in context.config:
            max_length = int(context.config["max_length"])
        
        length = len(context.output)
        
        # Score is normalized to 0-1 based on length, capped at max_length
        score = min(length / max_length, 1.0)
        
        return EvaluationResult(
            score=score,
            details={
                "length": length,
                "max_length": max_length,
                "normalized_score": score
            }
        )


# Register this plugin when the module is imported
register_plugin(OutputLengthEvaluation)

