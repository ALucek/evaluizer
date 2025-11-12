"""Common utility functions"""
import json
from typing import Dict, Any, List, Optional, TypeVar, Type
from sqlalchemy.orm import Session
from fastapi import HTTPException
from sqlalchemy import func
from app.models.prompt import Prompt

T = TypeVar('T')


def parse_json_safe(data: str, default=None):
    """Safely parse JSON string, returning default if parsing fails"""
    if data is None:
        return default
    try:
        return json.loads(data) if isinstance(data, str) else data
    except (json.JSONDecodeError, TypeError):
        return default


def get_or_404(db: Session, model: Type[T], id: int, detail: str = "Resource not found") -> T:
    """Get a model instance by ID or raise 404"""
    instance = db.query(model).filter(model.id == id).first()
    if not instance:
        raise HTTPException(status_code=404, detail=detail)
    return instance


def get_root_prompt_id(db: Session, prompt_id: int) -> int:
    """Find the root prompt ID by traversing parent_prompt_id chain"""
    prompt = db.query(Prompt).filter(Prompt.id == prompt_id).first()
    if not prompt:
        return prompt_id
    
    current_id = prompt_id
    while prompt and prompt.parent_prompt_id:
        current_id = prompt.parent_prompt_id
        prompt = db.query(Prompt).filter(Prompt.id == current_id).first()
    
    return current_id


def get_next_prompt_version(db: Session, root_prompt_id: int) -> int:
    """Get the next version number for a prompt"""
    max_version = db.query(func.max(Prompt.version)).filter(
        (Prompt.parent_prompt_id == root_prompt_id) | (Prompt.id == root_prompt_id)
    ).scalar() or 0
    return max_version + 1

