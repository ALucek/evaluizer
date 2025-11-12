import os
import re
from typing import AsyncIterator, Dict, Any
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
    
    def render_prompt(self, prompt_template: str, row_data: Dict[str, Any]) -> str:
        """
        Render a prompt template by replacing {{variable}} placeholders with actual values.
        
        Args:
            prompt_template: Template string with {{variable}} syntax
            row_data: Dictionary of column names to values
        
        Returns:
            Rendered prompt string
        """
        def replace_var(match):
            var_name = match.group(1).strip()
            # Get the value from row_data, default to empty string if not found
            value = str(row_data.get(var_name, ""))
            return value
        
        # Replace all {{variable}} patterns
        rendered = re.sub(r'\{\{([^}]+)\}\}', replace_var, prompt_template)
        return rendered
    
    async def stream_completion(
        self,
        prompt: str,
        model: str = "gpt-4o-mini",
        temperature: float = 0.7,
        max_tokens: int = 2000,
    ) -> AsyncIterator[str]:
        """
        Stream a completion from the LLM.
        
        Args:
            prompt: The prompt to send to the LLM
            model: Model name (default: gpt-4o-mini)
            temperature: Temperature setting (default: 0.7)
            max_tokens: Maximum tokens to generate (default: 2000)
        
        Yields:
            Chunks of text as they arrive
        """
        if not self.client:
            raise ValueError("LLM client not initialized")
        
        try:
            stream = await self.client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "user", "content": prompt}
                ],
                temperature=temperature,
                max_tokens=max_tokens,
                stream=True,
            )
            
            async for chunk in stream:
                if chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
                    
        except Exception as e:
            raise Exception(f"Error calling LLM: {str(e)}")


# Global instance
llm_service = LLMService()

