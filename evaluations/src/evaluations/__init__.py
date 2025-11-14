"""Function-based evaluations package for Evaluizer."""

from .base import EvaluationContext, EvaluationResult, EvaluationPlugin
from .registry import list_plugins, get_plugin, register_plugin

# Import plugins to trigger their registration
# This must happen after registry functions are defined
from . import plugins  # noqa: F401

__all__ = [
    "EvaluationContext",
    "EvaluationResult",
    "EvaluationPlugin",
    "list_plugins",
    "get_plugin",
    "register_plugin",
]

