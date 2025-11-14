# Function-Based Evaluations

This package contains function-based evaluation plugins for Evaluizer. These evaluations run deterministic functions (rather than LLM calls) to score outputs.

## Structure

- `src/evaluations/base.py` - Core interfaces (`EvaluationPlugin`, `EvaluationContext`, `EvaluationResult`)
- `src/evaluations/registry.py` - Plugin registry for discovery and instantiation
- `src/evaluations/plugins/` - Individual evaluation plugin implementations

## Creating a New Evaluation Plugin

1. Create a new Python file in `src/evaluations/plugins/` (e.g., `my_evaluation.py`)

2. Implement the `EvaluationPlugin` protocol:

```python
from ..base import EvaluationPlugin, EvaluationContext, EvaluationResult
from ..registry import register_plugin

class MyEvaluation(EvaluationPlugin):
    name = "my_evaluation"
    description = "What this evaluation measures"
    
    def run(self, context: EvaluationContext) -> EvaluationResult:
        # Your evaluation logic here
        # context.row - the CSV row data as a dict
        # context.output - the output string to evaluate (may be None)
        # context.config - optional configuration dict
        
        score = 0.5  # Your calculated score
        
        return EvaluationResult(
            score=score,
            details={"additional": "metadata"}
        )

# Register the plugin
register_plugin(MyEvaluation)
```

3. That's it! The plugin will be automatically discovered and available via the registry. No need to edit any `__init__.py` files.

## Example Plugin

See `src/evaluations/plugins/output_length.py` for a complete example that scores outputs based on length.

## Usage

```python
from evaluations.registry import list_plugins, get_plugin
from evaluations.base import EvaluationContext

# List all available plugins
plugins = list_plugins()
for plugin_info in plugins:
    print(f"{plugin_info.name}: {plugin_info.description}")

# Get and run a plugin
plugin = get_plugin("output_length")
context = EvaluationContext(
    row={"column1": "value1"},
    output="Some output text",
    config={"max_length": 500}
)
result = plugin.run(context)
print(f"Score: {result.score}, Details: {result.details}")
```

