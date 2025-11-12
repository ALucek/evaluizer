import os
import re
from typing import Dict, Any, Optional
from app.config.llm_models import get_model_config, get_default_model, is_model_available, get_all_models
from app.services.providers.registry import get_provider, is_provider_available
from app.services.providers.base import LLMProvider


class LLMService:
    """Service for interacting with LLM providers"""
    
    def __init__(self):
        self._providers: Dict[str, LLMProvider] = {}
    
    def _get_provider_for_model(self, model_id: str) -> LLMProvider:
        """
        Get or create a provider instance for the given model.
        
        Args:
            model_id: The model identifier
        
        Returns:
            An LLMProvider instance
        """
        model_config = get_model_config(model_id)
        if not model_config:
            raise ValueError(f"Model '{model_id}' not found")
        
        provider_name = model_config.provider
        
        # Check if we already have this provider cached
        if provider_name in self._providers:
            return self._providers[provider_name]
        
        # Create a new provider instance
        if not is_provider_available(provider_name):
            from app.services.providers.registry import list_providers
            available = ", ".join(list_providers())
            raise ValueError(f"Provider '{provider_name}' not available. Available providers: {available}")
        
        # Get provider-specific configuration from model config
        provider_kwargs = {}
        
        # Handle API key environment variable
        if model_config.requires_api_key_env:
            api_key = os.getenv(model_config.requires_api_key_env)
            if api_key:
                provider_kwargs["api_key"] = api_key
        
        # Handle base URL environment variable
        if model_config.base_url_env:
            base_url = os.getenv(model_config.base_url_env)
            if base_url:
                provider_kwargs["base_url"] = base_url
        
        # Create provider instance
        provider = get_provider(provider_name, **provider_kwargs)
        
        # Cache it for reuse
        self._providers[provider_name] = provider
        
        return provider
    
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
        model: Optional[str] = None,
        temperature: Optional[float] = None,
        max_completion_tokens: Optional[int] = None,
    ) -> str:
        """
        Get a completion from the LLM.
        
        Args:
            prompt: The prompt to send to the LLM
            model: Model ID (defaults to configured default model)
            temperature: Temperature setting (defaults to model's default)
            max_completion_tokens: Maximum completion tokens to generate (defaults to model's default)
        
        Returns:
            The complete response text from the LLM
        
        Raises:
            ValueError: If model is not available
            Exception: If the provider call fails
        """
        # Get model configuration
        model_id = model or get_default_model()
        if not is_model_available(model_id):
            raise ValueError(f"Model '{model_id}' is not available. Available models: {', '.join(get_all_models().keys())}")
        
        model_config = get_model_config(model_id)
        if not model_config:
            raise ValueError(f"Configuration not found for model '{model_id}'")
        
        # Use model defaults if not provided
        final_temperature = temperature if temperature is not None else model_config.default_temperature
        final_max_tokens = max_completion_tokens if max_completion_tokens is not None else model_config.default_max_tokens
        
        # Get the appropriate provider for this model
        provider = self._get_provider_for_model(model_id)
        
        # Prepare provider-specific parameters
        provider_kwargs = {}
        
        # Pass max_tokens_param for OpenAI provider (needed for GPT-5 models)
        if model_config.provider == "openai":
            provider_kwargs["max_tokens_param"] = model_config.max_tokens_param
        
        # Add any model-specific extra parameters
        if model_config.extra_params:
            provider_kwargs.update(model_config.extra_params)
        
        try:
            # Call the provider's completion method
            response = await provider.completion(
                prompt=prompt,
                model=model_id,
                temperature=final_temperature,
                max_tokens=final_max_tokens,
                **provider_kwargs
            )
            return response
        except Exception as e:
            raise Exception(f"Error calling LLM provider '{model_config.provider}': {str(e)}")


# Global instance
llm_service = LLMService()

