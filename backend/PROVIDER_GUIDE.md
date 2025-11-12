# LLM Provider System Guide

## Overview

The LLM provider system allows you to easily add support for multiple LLM providers (OpenAI, Anthropic, Google, etc.) with a standardized interface. Each provider implements its own completion function while maintaining a consistent API.

## Architecture

```
app/
├── config/
│   └── llm_models.py          # Model configurations (which provider each model uses)
├── services/
│   ├── llm_service.py         # Main service that routes to providers
│   └── providers/
│       ├── base.py             # Abstract base class (LLMProvider)
│       ├── registry.py         # Provider registry/factory
│       ├── openai_provider.py  # OpenAI implementation
│       └── anthropic_provider.py  # Example template
```

## How It Works

1. **Model Configuration** (`llm_models.py`): Each model specifies which provider it uses
2. **Provider Registry** (`registry.py`): Maps provider names to provider classes
3. **Provider Implementation**: Each provider implements the `LLMProvider` interface
4. **LLM Service** (`llm_service.py`): Routes requests to the appropriate provider based on model config

## Adding a New Provider

### Step 1: Create Provider Class

Create `app/services/providers/your_provider.py`:

```python
from app.services.providers.base import LLMProvider

class YourProvider(LLMProvider):
    def _initialize_client(self, **kwargs):
        # Initialize your provider's client
        self._client = YourClient(api_key=self.api_key)
    
    async def completion(self, prompt, model, temperature, max_tokens, **kwargs):
        # Call your provider's API and return the response text
        response = await self._client.complete(...)
        return response.text
```

### Step 2: Register Provider

In `app/services/providers/registry.py`:

```python
from app.services.providers.your_provider import YourProvider

_PROVIDERS = {
    "openai": OpenAIProvider,
    "your_provider": YourProvider,  # Add this
}
```

### Step 3: Add Models

In `app/config/llm_models.py`:

```python
MODELS = {
    "your-model": ModelConfig(
        id="your-model",
        label="Your Model",
        provider="your_provider",  # Must match registry name
        # ... other config ...
    ),
}
```

That's it! The system will automatically use your provider when models reference it.

## Standard Interface

All providers must implement:

```python
async def completion(
    self,
    prompt: str,           # The prompt text
    model: str,            # Model identifier
    temperature: float,    # Temperature setting
    max_tokens: int,       # Max tokens to generate
    **kwargs               # Provider-specific params
) -> str:                 # Returns response text
```

## Provider-Specific Parameters

If your provider needs special parameters:

1. Accept them in `**kwargs` in your `completion()` method
2. Add them to `extra_params` in model config:

```python
ModelConfig(
    # ...
    extra_params={"top_p": 0.9, "custom_param": "value"}
)
```

These will be automatically passed to your provider.

## Environment Variables

Providers can use environment variables for API keys:

- **Default**: Provider checks its default env var (e.g., `OPENAI_API_KEY`)
- **Custom**: Set `requires_api_key_env` in model config to use a different env var
- **Base URL**: Set `base_url_env` in model config for custom endpoints

## Examples

See `app/services/providers/anthropic_provider.py` for a complete commented example.

