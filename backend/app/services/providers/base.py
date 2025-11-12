"""
Base LLM Provider Interface

This module defines the standard interface that all LLM providers must implement.
To add a new provider, create a class that inherits from LLMProvider and implements
the completion method.
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, Optional


class LLMProvider(ABC):
    """
    Abstract base class for LLM providers.
    
    All providers must implement the completion method with this signature.
    The provider is responsible for:
    - Initializing its own client (if needed)
    - Handling provider-specific API calls
    - Converting responses to the standard format
    """
    
    def __init__(self, api_key: Optional[str] = None, base_url: Optional[str] = None, **kwargs):
        """
        Initialize the provider.
        
        Args:
            api_key: API key for the provider (if required)
            base_url: Base URL for the provider API (if different from default)
            **kwargs: Additional provider-specific configuration
        """
        self.api_key = api_key
        self.base_url = base_url
        self._client = None
        self._initialize_client(**kwargs)
    
    @abstractmethod
    def _initialize_client(self, **kwargs) -> None:
        """
        Initialize the provider's client.
        This is called during __init__.
        
        Args:
            **kwargs: Additional provider-specific configuration
        """
        pass
    
    @abstractmethod
    async def completion(
        self,
        prompt: str,
        model: str,
        temperature: float,
        max_tokens: int,
        **kwargs
    ) -> str:
        """
        Get a completion from the LLM provider.
        
        This is the standard interface that all providers must implement.
        The method should handle provider-specific API calls and return
        the response text.
        
        Args:
            prompt: The prompt text to send to the LLM
            model: The model identifier (provider-specific)
            temperature: Temperature setting (0.0-2.0 typically)
            max_tokens: Maximum tokens to generate
            **kwargs: Additional provider-specific parameters
        
        Returns:
            The response text from the LLM
        
        Raises:
            Exception: If the API call fails or returns an error
        """
        pass
    
    def get_client(self):
        """Get the provider's client instance (if applicable)"""
        return self._client

