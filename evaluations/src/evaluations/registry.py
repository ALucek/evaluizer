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
    
    # Allow re-registration if it's the same class (for refresh scenarios)
    if name in _registry:
        existing_info = _registry[name]
        if existing_info.plugin_class == plugin_class:
            # Same class, just update the info in case description changed
            _registry[name] = PluginInfo(
                name=name,
                description=getattr(plugin_instance, 'description', None),
                plugin_class=plugin_class
            )
            return
        else:
            raise ValueError(f"Plugin with name '{name}' is already registered with a different class")
    
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


def refresh_plugins() -> None:
    """
    Re-discover and reload all plugin modules.
    This allows new plugin files to be discovered without restarting the backend.
    
    This will reload the plugins module, which will re-discover all plugin files
    (both existing and new) and re-register them.
    """
    import importlib
    from . import plugins
    
    # Reload the plugins module, which will call _discover_plugins() again
    # This will reload existing modules and discover new ones
    importlib.reload(plugins)

