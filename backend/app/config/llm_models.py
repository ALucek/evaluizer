"""
LLM Model Configuration Template

This file defines all available LLM models and their configurations.
To add a new model, simply add a new entry to the MODELS dictionary.

Each model configuration includes:
- id: Unique identifier for the model (used in API calls)
- label: Display name shown in the UI
- provider: The provider name (must match a registered provider in providers/registry.py)
- max_tokens_param: Parameter name for max tokens ('max_completion_tokens' or 'max_tokens')
- default_temperature: Default temperature value
- default_max_tokens: Default max tokens value
- supports_streaming: Whether the model supports streaming
- requires_api_key_env: Environment variable name for API key (if different from provider default)
- base_url_env: Environment variable name for base URL (if different from provider default)
- extra_params: Optional dict of model-specific parameters to pass to the provider

To add a new provider:
1. Create a new provider class in app/services/providers/ that inherits from LLMProvider
2. Implement the completion() method with the standard signature
3. Register it in app/services/providers/registry.py using register_provider()
4. Add models that use this provider to the MODELS dictionary below
"""

from typing import Dict, Any, Optional
from dataclasses import dataclass


@dataclass
class ModelConfig:
    """Configuration for an LLM model"""
    id: str
    label: str
    provider: str
    max_tokens_param: str = "max_tokens"  # 'max_completion_tokens' or 'max_tokens'
    default_temperature: float = 1.0
    default_max_tokens: int = 2000
    supports_streaming: bool = True
    requires_api_key_env: Optional[str] = None  # If None, uses provider default
    base_url_env: Optional[str] = None  # If None, uses provider default
    extra_params: Optional[Dict[str, Any]] = None  # Model-specific parameters


# Model configuration template
# Add new models here following the template structure
MODELS: Dict[str, ModelConfig] = {
    "gpt-5": ModelConfig(
        id="gpt-5",
        label="GPT-5",
        provider="openai",
        max_tokens_param="max_completion_tokens",
        default_temperature=1.0,
        default_max_tokens=2000,
        supports_streaming=True,
    ),
    "gpt-5-mini": ModelConfig(
        id="gpt-5-mini",
        label="GPT-5 Mini",
        provider="openai",
        max_tokens_param="max_completion_tokens",
        default_temperature=1.0,
        default_max_tokens=2000,
        supports_streaming=True,
    ),
    "gpt-5-nano": ModelConfig(
        id="gpt-5-nano",
        label="GPT-5 Nano",
        provider="openai",
        max_tokens_param="max_completion_tokens",
        default_temperature=1.0,
        default_max_tokens=2000,
        supports_streaming=True,
    ),
    # Example: Adding a new OpenAI model
    # "gpt-4": ModelConfig(
    #     id="gpt-4",
    #     label="GPT-4",
    #     provider="openai",
    #     max_tokens_param="max_tokens",  # Older models use max_tokens
    #     default_temperature=0.7,
    #     default_max_tokens=3000,
    #     supports_streaming=True,
    # ),
    # Example: Adding an Anthropic model
    # "claude-3-opus": ModelConfig(
    #     id="claude-3-opus",
    #     label="Claude 3 Opus",
    #     provider="anthropic",
    #     max_tokens_param="max_tokens",
    #     default_temperature=1.0,
    #     default_max_tokens=4096,
    #     supports_streaming=True,
    #     requires_api_key_env="ANTHROPIC_API_KEY",
    #     base_url_env="ANTHROPIC_BASE_URL",
    # ),
}


def get_model_config(model_id: str) -> Optional[ModelConfig]:
    """Get configuration for a specific model"""
    return MODELS.get(model_id)


def get_all_models() -> Dict[str, ModelConfig]:
    """Get all available model configurations"""
    return MODELS.copy()


def get_models_by_provider(provider: str) -> Dict[str, ModelConfig]:
    """Get all models for a specific provider"""
    return {id: config for id, config in MODELS.items() if config.provider == provider}


def is_model_available(model_id: str) -> bool:
    """Check if a model is available"""
    return model_id in MODELS


def get_default_model() -> str:
    """Get the default model ID"""
    return "gpt-5-mini"

