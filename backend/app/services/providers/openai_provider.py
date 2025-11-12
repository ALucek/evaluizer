"""
OpenAI Provider Implementation

This provider handles all OpenAI-compatible API calls.
"""

import os
from typing import Optional, Dict, Any
from openai import AsyncOpenAI

from app.services.providers.base import LLMProvider


class OpenAIProvider(LLMProvider):
    """Provider for OpenAI and OpenAI-compatible APIs"""
    
    def _initialize_client(self, **kwargs) -> None:
        """Initialize the OpenAI client"""
        api_key = self.api_key or os.getenv("OPENAI_API_KEY")
        base_url = self.base_url or os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
        
        if not api_key:
            # Allow initialization without API key for now
            # Will fail when actually calling the API
            api_key = "not-set"
        
        self._client = AsyncOpenAI(
            api_key=api_key,
            base_url=base_url,
        )
    
    async def completion(
        self,
        prompt: str,
        model: str,
        temperature: float,
        max_tokens: int,
        max_tokens_param: str = "max_tokens",
        **kwargs
    ) -> str:
        """
        Get a completion from OpenAI.
        
        Args:
            prompt: The prompt text
            model: Model identifier (e.g., 'gpt-5-mini')
            temperature: Temperature setting
            max_tokens: Maximum tokens to generate
            max_tokens_param: Parameter name for max tokens ('max_tokens' or 'max_completion_tokens')
            **kwargs: Additional OpenAI-specific parameters
        
        Returns:
            The response text
        """
        if not self._client:
            raise ValueError("OpenAI client not initialized")
        
        api_params: Dict[str, Any] = {
            "model": model,
            "messages": [
                {"role": "user", "content": prompt}
            ],
            "temperature": temperature,
            "stream": False,
        }
        
        # Use the specified parameter name for max tokens
        api_params[max_tokens_param] = max_tokens
        
        # Add any additional parameters
        api_params.update(kwargs)
        
        response = await self._client.chat.completions.create(**api_params)
        
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

