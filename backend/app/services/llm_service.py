"""LLM service for interacting with LLM providers via LiteLLM"""
import re
from typing import Dict, Any, Optional, List
from litellm import acompletion

# TODO: Replace these placeholders with your actual judge prompt prefix and suffix
# The prefix should contain instructions for the LLM judge
# The suffix should instruct the LLM to output the score in <score>NUMBER</score> format
JUDGE_PROMPT_PREFIX = """You are an expert evaluator. Please evaluate the following and provide a score.

"""
JUDGE_PROMPT_SUFFIX = """

Please provide your evaluation score in the following format:
<score>NUMBER</score>
Where NUMBER is a numeric score (e.g., 0.5, 1.0, 2.5, etc.)
"""


class LLMService:
    """Service for interacting with LLM providers via LiteLLM"""
    
    def render_prompt(
        self, 
        prompt_template: str, 
        row_data: Dict[str, Any], 
        available_columns: Optional[List[str]] = None
    ) -> str:
        """
        Render a prompt template by replacing {{variable}} placeholders with actual values.
        
        Args:
            prompt_template: Template string with {{variable}} syntax
            row_data: Dictionary of column names to values
            available_columns: Optional list of available column names for validation
        
        Returns:
            Rendered prompt string
        
        Raises:
            ValueError: If a column name in the template doesn't exist in available_columns
        """
        # Extract all column names from the template
        column_names_in_template = re.findall(r'\{\{([^}]+)\}\}', prompt_template)
        column_names_in_template = [name.strip() for name in column_names_in_template]
        
        # Validate column names if available_columns is provided
        if available_columns is not None:
            missing_columns = [col for col in column_names_in_template if col not in available_columns]
            if missing_columns:
                raise ValueError(
                    f"Prompt template references columns that don't exist: {', '.join(missing_columns)}. "
                    f"Available columns: {', '.join(available_columns)}"
                )
        
        def replace_var(match):
            var_name = match.group(1).strip()
            # Get the value from row_data, default to empty string if not found
            value = str(row_data.get(var_name, ""))
            return value
        
        # Replace all {{variable}} patterns
        rendered = re.sub(r'\{\{([^}]+)\}\}', replace_var, prompt_template)
        return rendered
    
    async def completion(
        self,
        prompt: str,
        model: str,
        temperature: Optional[float] = None,
        max_completion_tokens: Optional[int] = None,
    ) -> str:
        """
        Get a completion from the LLM via LiteLLM.
        
        Args:
            prompt: The prompt to send to the LLM
            model: Any LiteLLM-supported model ID (e.g., 'gpt-4', 'azure/gpt-4', 'gemini/gemini-pro')
            temperature: Temperature setting (defaults to 1.0)
            max_completion_tokens: Maximum tokens to generate (defaults to 2000)
        
        Returns:
            The complete response text from the LLM
        """
        # Use defaults if not provided
        final_temperature = temperature if temperature is not None else 1.0
        final_max_tokens = max_completion_tokens if max_completion_tokens is not None else 2000
        
        # Call LiteLLM directly - it handles everything!
        response = await acompletion(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            temperature=final_temperature,
            max_tokens=final_max_tokens,
        )
        
        # Extract text from response
        if response and response.choices and len(response.choices) > 0:
            choice = response.choices[0]
            if choice.message and choice.message.content:
                return choice.message.content
        
        return ""
    
    def build_judge_prompt(
        self,
        core_prompt: str,
        row_data: Dict[str, Any],
        available_columns: Optional[List[str]] = None
    ) -> str:
        """
        Build a complete judge prompt by wrapping the core prompt with prefix and suffix,
        then rendering any {{variable}} placeholders.
        
        Args:
            core_prompt: The user-provided judge prompt (may contain {{variable}} syntax)
            row_data: Dictionary of column names to values
            available_columns: Optional list of available column names for validation
        
        Returns:
            Complete judge prompt string with prefix, rendered core prompt, and suffix
        
        Raises:
            ValueError: If a column name in the template doesn't exist in available_columns
        """
        # First render the core prompt to substitute {{variable}} placeholders
        rendered_core = self.render_prompt(core_prompt, row_data, available_columns)
        
        # Combine prefix + rendered core + suffix
        complete_prompt = JUDGE_PROMPT_PREFIX + rendered_core + JUDGE_PROMPT_SUFFIX
        return complete_prompt
    
    def parse_judge_score(self, output: str) -> float:
        """
        Parse a numeric score from LLM output that should contain <score>NUMBER</score>.
        
        Args:
            output: The raw LLM output text
        
        Returns:
            The parsed score as a float
        
        Raises:
            ValueError: If no valid score is found in the expected format
        """
        # Look for <score>NUMBER</score> pattern
        pattern = r'<score>\s*([+-]?\d*\.?\d+)\s*</score>'
        match = re.search(pattern, output, re.IGNORECASE)
        
        if match:
            try:
                score = float(match.group(1))
                return score
            except ValueError:
                raise ValueError(f"Could not parse score value: {match.group(1)}")
        
        # If no match found, raise an error
        raise ValueError(
            f"No valid score found in LLM output. Expected format: <score>NUMBER</score>. "
            f"Output received: {output[:200]}..." if len(output) > 200 else f"Output received: {output}"
        )


# Global instance
llm_service = LLMService()

