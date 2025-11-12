"""Common utility functions"""
import json
from typing import Dict, Any, List, Optional, TypeVar, Type, Union
from sqlalchemy.orm import Session
from fastapi import HTTPException
from sqlalchemy import func
from app.models.prompt import Prompt

T = TypeVar('T')


def parse_json_safe(data: Optional[Union[str, Dict, List]], default: Optional[Any] = None) -> Any:
    """
    Safely parse JSON string, returning default if parsing fails.
    
    Args:
        data: JSON string or already parsed data
        default: Default value to return if parsing fails
        
    Returns:
        Parsed JSON data or default value
    """
    if data is None:
        return default
    try:
        return json.loads(data) if isinstance(data, str) else data
    except (json.JSONDecodeError, TypeError):
        return default


def get_or_404(db: Session, model: Type[T], id: int, detail: str = "Resource not found") -> T:
    """
    Get a model instance by ID or raise 404.
    
    Args:
        db: Database session
        model: SQLAlchemy model class
        id: Primary key ID
        detail: Error message if not found
        
    Returns:
        Model instance
        
    Raises:
        HTTPException: 404 if resource not found
    """
    instance = db.query(model).filter(model.id == id).first()
    if not instance:
        raise HTTPException(status_code=404, detail=detail)
    return instance


def get_root_prompt_id(db: Session, prompt_id: int) -> int:
    """
    Find the root prompt ID by traversing parent_prompt_id chain.
    Optimized to minimize database queries by fetching all prompts in the chain at once.
    
    Args:
        db: Database session
        prompt_id: Starting prompt ID
        
    Returns:
        Root prompt ID
    """
    # First, verify the prompt exists
    prompt = db.query(Prompt).filter(Prompt.id == prompt_id).first()
    if not prompt:
        return prompt_id
    
    # If no parent, this is already the root
    if not prompt.parent_prompt_id:
        return prompt_id
    
    # Collect all IDs in the chain by traversing up
    # We'll do a limited number of queries (max depth check)
    ids_in_chain = [prompt_id]
    current_parent_id = prompt.parent_prompt_id
    max_depth = 100  # Prevent infinite loops
    
    # Build the chain of IDs
    while current_parent_id and len(ids_in_chain) < max_depth:
        if current_parent_id in ids_in_chain:
            # Circular reference detected, return the first occurrence as root
            return ids_in_chain[0]
        ids_in_chain.append(current_parent_id)
        
        # Fetch this parent to get its parent_prompt_id
        parent = db.query(Prompt).filter(Prompt.id == current_parent_id).first()
        if not parent or not parent.parent_prompt_id:
            break
        current_parent_id = parent.parent_prompt_id
    
    # Fetch all prompts in the chain in one query
    prompts = db.query(Prompt).filter(Prompt.id.in_(ids_in_chain)).all()
    prompt_map = {p.id: p for p in prompts}
    
    # Find the root by traversing the map
    current_id = prompt_id
    visited = set()  # Prevent infinite loops
    
    while current_id in prompt_map:
        if current_id in visited:
            # Circular reference detected, return current as root
            return current_id
        visited.add(current_id)
        
        current_prompt = prompt_map[current_id]
        if not current_prompt.parent_prompt_id:
            return current_id
        current_id = current_prompt.parent_prompt_id
    
    return current_id


def get_next_prompt_version(db: Session, root_prompt_id: int) -> int:
    """
    Get the next version number for a prompt.
    
    Args:
        db: Database session
        root_prompt_id: Root prompt ID to get next version for
        
    Returns:
        Next version number
    """
    max_version = db.query(func.max(Prompt.version)).filter(
        (Prompt.parent_prompt_id == root_prompt_id) | (Prompt.id == root_prompt_id)
    ).scalar() or 0
    return max_version + 1

