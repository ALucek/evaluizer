"""Simple in-process registry for evaluation plugins."""

from typing import Dict, Type, Optional
from dataclasses import dataclass

from .base import EvaluationPlugin, EvaluationContext, EvaluationResult


@dataclass
class PluginInfo:
    """Information about a registered plugin."""
    name: str
    description: Optional[str] = None
    plugin_class: Optional[Type[EvaluationPlugin]] = None


# Global registry mapping plugin names to their classes
_registry: Dict[str, PluginInfo] = {}


def register_plugin(plugin_class: Type[EvaluationPlugin]) -> None:
    """
    Register an evaluation plugin class.
    
    Plugins should call this function when their module is imported.
    
    Args:
        plugin_class: The plugin class to register (must have a 'name' attribute)
    """
    if not hasattr(plugin_class, 'name'):
        raise ValueError(f"Plugin class {plugin_class.__name__} must have a 'name' attribute")
    
    plugin_instance = plugin_class()
    name = plugin_instance.name
    
    if name in _registry:
        raise ValueError(f"Plugin with name '{name}' is already registered")
    
    _registry[name] = PluginInfo(
        name=name,
        description=getattr(plugin_instance, 'description', None),
        plugin_class=plugin_class
    )


def list_plugins() -> list[PluginInfo]:
    """
    List all registered evaluation plugins.
    
    Returns:
        List of PluginInfo objects for all registered plugins
    """
    return list(_registry.values())


def get_plugin(name: str) -> EvaluationPlugin:
    """
    Get an instance of a plugin by name.
    
    Args:
        name: The name of the plugin to retrieve
        
    Returns:
        An instance of the plugin
        
    Raises:
        KeyError: If no plugin with the given name is registered
    """
    if name not in _registry:
        raise KeyError(f"No plugin with name '{name}' is registered")
    
    plugin_info = _registry[name]
    if plugin_info.plugin_class is None:
        raise ValueError(f"Plugin '{name}' has no plugin_class set")
    
    return plugin_info.plugin_class()

