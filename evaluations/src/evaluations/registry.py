"""Simple in-process registry for evaluation plugins."""

from typing import Dict, Type, Optional
from dataclasses import dataclass

from .base import EvaluationPlugin


@dataclass
class PluginInfo:
    """Information about a registered plugin."""
    name: str
    description: Optional[str] = None
    instance: Optional[EvaluationPlugin] = None


# Global registry mapping plugin names to their info
_registry: Dict[str, PluginInfo] = {}


def register_plugin(plugin_class: Type[EvaluationPlugin]) -> None:
    """
    Register an evaluation plugin class.
    Instantiates the plugin immediately.
    
    Args:
        plugin_class: The plugin class to register (must have a 'name' attribute)
    """
    # Instantiate the plugin
    try:
        plugin_instance = plugin_class()
    except Exception as e:
        raise ValueError(f"Failed to instantiate plugin class {plugin_class.__name__}: {e}")

    if not hasattr(plugin_instance, 'name'):
        raise ValueError(f"Plugin class {plugin_class.__name__} must have a 'name' attribute")
    
    name = plugin_instance.name
    
    # Allow re-registration if it's the same class (for refresh scenarios)
    # or update with new instance if code changed
    _registry[name] = PluginInfo(
        name=name,
        description=getattr(plugin_instance, 'description', None),
        instance=plugin_instance
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
        The shared instance of the plugin
        
    Raises:
        KeyError: If no plugin with the given name is registered
    """
    if name not in _registry:
        raise KeyError(f"No plugin with name '{name}' is registered")
    
    plugin_info = _registry[name]
    if plugin_info.instance is None:
        raise ValueError(f"Plugin '{name}' has no instance set")
    
    return plugin_info.instance


def refresh_plugins() -> None:
    """
    Re-discover and reload all plugin modules.
    This allows new plugin files to be discovered without restarting the backend.
    """
    import importlib
    from . import plugins
    
    # Reload the plugins module, which will call _discover_plugins() again
    # This will reload existing modules and discover new ones
    importlib.reload(plugins)
