# LLM Provider System

This directory contains the provider abstraction system for supporting multiple LLM providers.

## Architecture

The provider system uses a standard interface (`LLMProvider`) that all providers must implement. This allows you to easily add support for new LLM providers without modifying the core LLM service.

## Adding a New Provider

To add a new provider, follow these steps:

### 1. Create a Provider Class

Create a new file `your_provider_provider.py` in this directory:

```python
from typing import Optional, Dict, Any
import os
# Import your provider's SDK here

from app.services.providers.base import LLMProvider


class YourProvider(LLMProvider):
    """Provider for Your LLM Service"""
    
    def _initialize_client(self, **kwargs) -> None:
        """Initialize your provider's client"""
        api_key = self.api_key or os.getenv("YOUR_PROVIDER_API_KEY")
        base_url = self.base_url or os.getenv("YOUR_PROVIDER_BASE_URL", "https://api.yourprovider.com")
        
        if not api_key:
            api_key = "not-set"
        
        # Initialize your provider's client
        self._client = YourProviderClient(api_key=api_key, base_url=base_url)
    
    async def completion(
        self,
        prompt: str,
        model: str,
        temperature: float,
        max_tokens: int,
        **kwargs
    ) -> str:
        """
        Get a completion from your provider.
        
        Args:
            prompt: The prompt text
            model: Model identifier
            temperature: Temperature setting
            max_tokens: Maximum tokens to generate
            **kwargs: Additional provider-specific parameters
        
        Returns:
            The response text
        """
        if not self._client:
            raise ValueError("Your provider client not initialized")
        
        try:
            # Call your provider's API
            response = await self._client.complete(
                prompt=prompt,
                model=model,
                temperature=temperature,
                max_tokens=max_tokens,
                **kwargs
            )
            
            # Extract and return the text response
            # Adjust this based on your provider's response format
            return response.text
            
        except Exception as e:
            raise Exception(f"Error calling Your Provider API: {str(e)}")
```

### 2. Register the Provider

Add your provider to `registry.py`:

```python
from app.services.providers.your_provider_provider import YourProvider

_PROVIDERS: Dict[str, Type[LLMProvider]] = {
    "openai": OpenAIProvider,
    "your_provider": YourProvider,  # Add this line
}
```

Or register it dynamically:

```python
from app.services.providers.registry import register_provider
from app.services.providers.your_provider_provider import YourProvider

register_provider("your_provider", YourProvider)
```

### 3. Add Models

Add models that use your provider to `app/config/llm_models.py`:

```python
MODELS: Dict[str, ModelConfig] = {
    # ... existing models ...
    
    "your-model-1": ModelConfig(
        id="your-model-1",
        label="Your Model 1",
        provider="your_provider",  # Must match the provider name in registry
        max_tokens_param="max_tokens",
        default_temperature=0.7,
        default_max_tokens=2000,
        supports_streaming=True,
        requires_api_key_env="YOUR_PROVIDER_API_KEY",  # Optional
        base_url_env="YOUR_PROVIDER_BASE_URL",  # Optional
    ),
}
```

### 4. Test Your Provider

Your provider will automatically be used when a model that references it is called through the LLM service.

## Provider Interface

All providers must implement:

- `_initialize_client(**kwargs)`: Initialize the provider's client
- `completion(prompt, model, temperature, max_tokens, **kwargs)`: Get a completion

The `completion` method signature is standardized, but you can accept additional parameters via `**kwargs` for provider-specific features.

## Examples

See `anthropic_provider.py` for a commented example of how to implement an Anthropic provider.

## Provider-Specific Parameters

If your provider needs special parameters, you can:

1. Accept them in `**kwargs` in your `completion()` method
2. Add them to `extra_params` in the model configuration
3. They will be automatically passed through from the model config

Example:
```python
# In model config
"my-model": ModelConfig(
    # ... other params ...
    extra_params={"top_p": 0.9, "frequency_penalty": 0.5}
)

# In your provider
async def completion(self, prompt, model, temperature, max_tokens, top_p=None, frequency_penalty=None, **kwargs):
    # Use top_p and frequency_penalty
```

