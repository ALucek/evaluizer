"""
Provider Registry

This module manages all LLM providers and provides a factory function
to get the appropriate provider for a given provider name.
"""

from typing import Dict, Optional, Type
from app.services.providers.base import LLMProvider
from app.services.providers.openai_provider import OpenAIProvider


# Registry of all available providers
_PROVIDERS: Dict[str, Type[LLMProvider]] = {
    "openai": OpenAIProvider,
    # Add more providers here as they are implemented
    # "anthropic": AnthropicProvider,
    # "google": GoogleProvider,
}


def register_provider(name: str, provider_class: Type[LLMProvider]) -> None:
    """
    Register a new provider.
    
    Args:
        name: Provider identifier (e.g., 'openai', 'anthropic')
        provider_class: The provider class that implements LLMProvider
    """
    if not issubclass(provider_class, LLMProvider):
        raise TypeError(f"Provider class must inherit from LLMProvider")
    _PROVIDERS[name] = provider_class


def get_provider(name: str, **kwargs) -> LLMProvider:
    """
    Get a provider instance by name.
    
    Args:
        name: Provider identifier
        **kwargs: Arguments to pass to the provider's __init__
    
    Returns:
        An instance of the provider
    
    Raises:
        ValueError: If the provider is not registered
    """
    if name not in _PROVIDERS:
        available = ", ".join(_PROVIDERS.keys())
        raise ValueError(f"Provider '{name}' not found. Available providers: {available}")
    
    provider_class = _PROVIDERS[name]
    return provider_class(**kwargs)


def list_providers() -> list[str]:
    """Get a list of all registered provider names"""
    return list(_PROVIDERS.keys())


def is_provider_available(name: str) -> bool:
    """Check if a provider is registered"""
    return name in _PROVIDERS

