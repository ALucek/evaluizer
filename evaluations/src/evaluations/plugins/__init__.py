"""Evaluation plugins package."""

import importlib
import pkgutil
from pathlib import Path

# Auto-discover and import all plugin modules in this directory
# This allows users to just create a new .py file without editing this __init__.py
def _discover_plugins():
    """Automatically discover and import all plugin modules."""
    plugin_dir = Path(__file__).parent
    package_name = __name__
    
    # Import all modules in this directory (except __init__.py and __pycache__)
    for finder, name, ispkg in pkgutil.iter_modules([str(plugin_dir)]):
        if not ispkg and name != '__init__':
            try:
                importlib.import_module(f'{package_name}.{name}')
            except Exception as e:
                # Log but don't fail - allows other plugins to still load
                import warnings
                warnings.warn(f"Failed to import plugin module '{name}': {e}", ImportWarning)

# Auto-discover plugins on import
_discover_plugins()

