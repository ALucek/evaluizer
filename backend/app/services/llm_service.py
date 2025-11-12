import os
import re
from typing import Dict, Any
from openai import AsyncOpenAI


class LLMService:
    """Service for interacting with LLM providers"""
    
    def __init__(self):
        self.client = None
        self._initialize_client()
    
    def _initialize_client(self):
        """Initialize the OpenAI client"""
        api_key = os.getenv("OPENAI_API_KEY")
        base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
        
        if not api_key:
            # Allow initialization without API key for now
            # Will fail when actually calling the API
            api_key = "not-set"
        
        self.client = AsyncOpenAI(
            api_key=api_key,
            base_url=base_url,
        )
    
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
        model: str = "gpt-5-mini",
        temperature: float = 1.0,
        max_completion_tokens: int = 2000,
    ) -> str:
        """
        Get a completion from the LLM.
        
        Args:
            prompt: The prompt to send to the LLM
            model: Model name (default: gpt-5-mini)
            temperature: Temperature setting (default: 1.0)
            max_completion_tokens: Maximum completion tokens to generate (default: 2000)
        
        Returns:
            The complete response text from the LLM
        """
        if not self.client:
            raise ValueError("LLM client not initialized")
        
        try:
            api_params = {
                "model": model,
                "messages": [
                    {"role": "user", "content": prompt}
                ],
                "temperature": temperature,
                "stream": False,
            }
            
            # For GPT-5 models, use max_completion_tokens
            if "gpt-5" in model.lower():
                api_params["max_completion_tokens"] = max_completion_tokens
            else:
                # For older models, use max_tokens
                api_params["max_tokens"] = max_completion_tokens
            
            response = await self.client.chat.completions.create(**api_params)
            
            # Extract the content from the response
            if response.choices and len(response.choices) > 0:
                choice = response.choices[0]
                message = choice.message
                content = message.content
                
                # Handle empty content
                if not content or content.strip() == "":
                    # Check if there's content in refusal field
                    if hasattr(message, 'refusal') and message.refusal:
                        content = str(message.refusal)
                    else:
                        return ""
                
                return content
            else:
                raise Exception("No response from LLM")
                    
        except Exception as e:
            raise Exception(f"Error calling LLM: {str(e)}")


# Global instance
llm_service = LLMService()

