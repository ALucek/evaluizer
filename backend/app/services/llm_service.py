import re
from typing import Dict, Any, Optional
from litellm import acompletion


class LLMService:
    """Service for interacting with LLM providers via LiteLLM"""
    
    def render_prompt(self, prompt_template: str, row_data: Dict[str, Any], available_columns: list = None) -> str:
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


# Global instance
llm_service = LLMService()

