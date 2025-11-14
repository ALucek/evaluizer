"""Base interfaces and types for function-based evaluations."""

from typing import Protocol, Any, Optional
from pydantic import BaseModel


class EvaluationContext(BaseModel):
    """Context provided to an evaluation plugin when running."""
    row: dict[str, Any]  # The CSV row data as a dictionary
    output: Optional[str] = None  # The output string to evaluate (may be None)
    config: Optional[dict[str, Any]] = None  # Optional configuration for the evaluation


class EvaluationResult(BaseModel):
    """Result returned by an evaluation plugin."""
    score: float | int | bool  # Main score value
    details: Optional[dict[str, Any]] = None  # Optional additional details/metadata


class EvaluationPlugin(Protocol):
    """Protocol defining the interface for evaluation plugins."""
    
    name: str
    """Unique name identifier for this evaluation plugin."""
    
    description: Optional[str] = None
    """Human-readable description of what this evaluation measures."""
    
    def run(self, context: EvaluationContext) -> EvaluationResult:
        """
        Run the evaluation on the given context.
        
        Args:
            context: The evaluation context containing row data, output, and optional config
            
        Returns:
            EvaluationResult containing the score and optional details
            
        Raises:
            Exception: Any exception raised during evaluation will be caught and wrapped
        """
        ...

