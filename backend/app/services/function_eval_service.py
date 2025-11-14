"""Service for running function-based evaluations."""

from typing import Dict, Any, Optional, List
import sys
import os

# Add the evaluations package to the path
# Assuming evaluations is at the repo root, same level as backend
repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
evaluations_path = os.path.join(repo_root, 'evaluations', 'src')
if evaluations_path not in sys.path:
    sys.path.insert(0, evaluations_path)

try:
    # Import from package root to trigger plugin registration via __init__.py
    from evaluations import list_plugins, get_plugin
    from evaluations.base import EvaluationContext, EvaluationResult
except ImportError as e:
    # If evaluations package isn't available, provide fallback
    raise ImportError(
        f"Failed to import evaluations package. Make sure it's installed or available at {evaluations_path}. "
        f"Original error: {e}"
    )


def list_function_evaluations() -> List[Dict[str, Any]]:
    """
    List all available function-based evaluation plugins.
    
    Returns:
        List of dictionaries with plugin information (name, description)
    """
    try:
        plugins = list_plugins()
        return [
            {
                "name": plugin_info.name,
                "description": plugin_info.description or "",
            }
            for plugin_info in plugins
        ]
    except Exception as e:
        # Wrap any errors in a structured way
        raise RuntimeError(f"Failed to list function evaluations: {str(e)}")


def validate_function_name(function_name: str) -> bool:
    """
    Validate that a function name exists in the registry.
    
    Args:
        function_name: Name of the function evaluation plugin to validate
        
    Returns:
        True if the function exists
        
    Raises:
        KeyError: If the function evaluation plugin is not found
    """
    try:
        get_plugin(function_name)
        return True
    except KeyError:
        raise KeyError(f"Function evaluation '{function_name}' not found")


def run_function_evaluation(
    name: str,
    row: Dict[str, Any],
    output: Optional[str] = None,
    config: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Run a function-based evaluation.
    
    Args:
        name: Name of the evaluation plugin to run
        row: CSV row data as a dictionary
        output: The output string to evaluate (may be None)
        config: Optional configuration dictionary for the evaluation
        
    Returns:
        Dictionary with 'score' and optional 'details' keys
        
    Raises:
        KeyError: If the evaluation plugin is not found
        RuntimeError: If the evaluation fails to run
    """
    try:
        plugin = get_plugin(name)
    except KeyError as e:
        raise KeyError(f"Function evaluation '{name}' not found: {e}")
    except Exception as e:
        raise RuntimeError(f"Failed to get plugin '{name}': {str(e)}")
    
    try:
        context = EvaluationContext(
            row=row,
            output=output,
            config=config or {}
        )
        result = plugin.run(context)
        
        # Convert result to dictionary format
        return {
            "score": result.score,
            "details": result.details or {}
        }
    except Exception as e:
        # Wrap plugin execution errors
        raise RuntimeError(
            f"Error running function evaluation '{name}': {str(e)}"
        )

