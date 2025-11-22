"""Progress tracking for GEPA optimization"""
from typing import Dict, Optional, Any
from threading import Lock
from datetime import datetime, timezone

# Global progress store: config_id -> progress dict
_progress_store: Dict[int, Dict[str, Any]] = {}
_progress_lock = Lock()


def update_progress(config_id: int, **kwargs) -> None:
    """Update progress for a GEPA config"""
    with _progress_lock:
        if config_id not in _progress_store:
            # Use UTC with Z suffix for JS compatibility
            now = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
            _progress_store[config_id] = {
                "status": "running",
                "current_iteration": 0,
                "max_iterations": 0,
                "current_score": None,
                "best_score": None,
                "message": "",
                "updated_at": now,
                "started_at": now,
            }
        
        _progress_store[config_id].update(kwargs)
        _progress_store[config_id]["updated_at"] = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')


def get_progress(config_id: int) -> Optional[Dict[str, Any]]:
    """Get current progress for a GEPA config"""
    with _progress_lock:
        return _progress_store.get(config_id)


def clear_progress(config_id: int) -> None:
    """Clear progress for a GEPA config"""
    with _progress_lock:
        _progress_store.pop(config_id, None)


def set_complete(config_id: int, final_score: float, message: str = "Optimization completed", new_prompt_id: Optional[int] = None) -> None:
    """Mark optimization as complete"""
    update_progress(
        config_id=config_id,
        status="completed",
        best_score=final_score,
        message=message,
        new_prompt_id=new_prompt_id
    )


def set_error(config_id: int, error_message: str) -> None:
    """Mark optimization as failed"""
    update_progress(
        config_id=config_id,
        status="error",
        message=error_message
    )

