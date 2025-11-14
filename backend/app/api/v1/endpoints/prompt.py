from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional, Dict
from collections import defaultdict

from app.database import get_db
from app.models.prompt import Prompt
from app.models.csv_data import CSVFile
from app.utils import get_root_prompt_id, get_next_prompt_version, get_or_404
from app.schemas.prompt import (
    PromptResponse,
    CreatePromptRequest,
    UpdatePromptRequest,
    CreateVersionRequest
)

router = APIRouter()


@router.post("/", response_model=PromptResponse)
async def create_prompt(
    request: CreatePromptRequest,
    db: Session = Depends(get_db)
) -> PromptResponse:
    """Create a new prompt or a new version of an existing prompt"""
    # Verify CSV file exists if csv_file_id is provided
    if request.csv_file_id:
        get_or_404(db, CSVFile, request.csv_file_id, "CSV file not found")
    
    if not request.system_prompt or not request.system_prompt.strip():
        raise HTTPException(status_code=400, detail="system_prompt is required")
    
    # If parent_prompt_id is provided, create a new version
    if request.parent_prompt_id:
        parent_prompt = get_or_404(db, Prompt, request.parent_prompt_id, "Parent prompt not found")
        
        # Find the root prompt ID and get next version
        root_prompt_id = get_root_prompt_id(db, request.parent_prompt_id)
        version = get_next_prompt_version(db, root_prompt_id)
        
        prompt = Prompt(
            name=request.name or parent_prompt.name,
            system_prompt=request.system_prompt,
            user_message_column=request.user_message_column,
            csv_file_id=request.csv_file_id or parent_prompt.csv_file_id,
            parent_prompt_id=root_prompt_id,
            version=version,
            commit_message=request.commit_message
        )
    else:
        # Create a new root prompt (version 1)
        prompt = Prompt(
            name=request.name,
            system_prompt=request.system_prompt,
            user_message_column=request.user_message_column,
            csv_file_id=request.csv_file_id,
            version=1,
            commit_message=request.commit_message
        )
    
    try:
        db.add(prompt)
        db.commit()
        db.refresh(prompt)
        return prompt
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error creating prompt: {str(e)}")


@router.get("/", response_model=List[PromptResponse])
async def list_prompts(
    csv_file_id: Optional[int] = None,
    include_versions: bool = False,
    db: Session = Depends(get_db)
) -> List[PromptResponse]:
    """List all prompts, optionally filtered by CSV file.
    If include_versions is False, only returns root prompts (those without a parent).
    If include_versions is True, returns all prompts including versions."""
    query = db.query(Prompt)
    
    if csv_file_id:
        query = query.filter(Prompt.csv_file_id == csv_file_id)
    
    if not include_versions:
        # Only return root prompts (no parent)
        query = query.filter(Prompt.parent_prompt_id.is_(None))
    
    prompts = query.order_by(Prompt.created_at.desc()).all()
    return prompts


@router.get("/{prompt_id}", response_model=PromptResponse)
async def get_prompt(
    prompt_id: int, 
    db: Session = Depends(get_db)
) -> PromptResponse:
    """Get a specific prompt by ID"""
    return get_or_404(db, Prompt, prompt_id, "Prompt not found")


@router.put("/{prompt_id}", response_model=PromptResponse)
async def update_prompt(
    prompt_id: int,
    request: UpdatePromptRequest,
    db: Session = Depends(get_db)
) -> PromptResponse:
    """Update a prompt"""
    prompt = get_or_404(db, Prompt, prompt_id, "Prompt not found")
    
    # Verify CSV file exists if csv_file_id is provided
    if request.csv_file_id is not None:
        if request.csv_file_id:
            get_or_404(db, CSVFile, request.csv_file_id, "CSV file not found")
        prompt.csv_file_id = request.csv_file_id
    
    if request.name is not None:
        prompt.name = request.name
    
    if request.system_prompt is not None:
        prompt.system_prompt = request.system_prompt
    
    if request.user_message_column is not None:
        prompt.user_message_column = request.user_message_column
    
    if request.commit_message is not None:
        prompt.commit_message = request.commit_message
    
    try:
        db.commit()
        db.refresh(prompt)
        return prompt
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error updating prompt: {str(e)}")


@router.get("/{prompt_id}/versions", response_model=List[PromptResponse])
async def list_prompt_versions(
    prompt_id: int, 
    db: Session = Depends(get_db)
) -> List[PromptResponse]:
    """List all versions of a prompt"""
    get_or_404(db, Prompt, prompt_id, "Prompt not found")
    
    # Get the root prompt ID
    root_prompt_id = get_root_prompt_id(db, prompt_id)
    
    # Get all versions (including the root)
    versions = db.query(Prompt).filter(
        (Prompt.id == root_prompt_id) | (Prompt.parent_prompt_id == root_prompt_id)
    ).order_by(Prompt.version.asc()).all()
    
    return versions


@router.get("/grouped/by-name", response_model=Dict[str, List[PromptResponse]])
async def list_prompts_grouped_by_name(
    csv_file_id: Optional[int] = None,
    db: Session = Depends(get_db)
) -> Dict[str, List[PromptResponse]]:
    """List all prompts grouped by name (list of lists structure)"""
    query = db.query(Prompt)
    
    if csv_file_id:
        query = query.filter(Prompt.csv_file_id == csv_file_id)
    
    prompts = query.order_by(Prompt.created_at.desc()).all()
    
    # Group by name (use "Unnamed" for null names)
    grouped: Dict[str, List[PromptResponse]] = defaultdict(list)
    for prompt in prompts:
        name = prompt.name or "Unnamed"
        grouped[name].append(prompt)
    
    # Sort versions within each group by version number
    for name in grouped:
        grouped[name].sort(key=lambda p: p.version)
    
    return dict(grouped)


@router.post("/{prompt_id}/versions", response_model=PromptResponse)
async def create_prompt_version(
    prompt_id: int,
    request: CreateVersionRequest,
    db: Session = Depends(get_db)
) -> PromptResponse:
    """Create a new version of an existing prompt"""
    parent_prompt = get_or_404(db, Prompt, prompt_id, "Prompt not found")
    
    # Get the root prompt ID and next version
    root_prompt_id = get_root_prompt_id(db, prompt_id)
    version = get_next_prompt_version(db, root_prompt_id)
    
    if not request.system_prompt:
        raise HTTPException(status_code=400, detail="system_prompt is required")
    
    prompt = Prompt(
        name=request.name or parent_prompt.name,
        system_prompt=request.system_prompt,
        user_message_column=request.user_message_column if request.user_message_column is not None else parent_prompt.user_message_column,
        csv_file_id=parent_prompt.csv_file_id,
        parent_prompt_id=root_prompt_id,
        version=version,
        commit_message=request.commit_message
    )
    
    try:
        db.add(prompt)
        db.commit()
        db.refresh(prompt)
        return prompt
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error creating prompt version: {str(e)}")


@router.delete("/{prompt_id}")
async def delete_prompt(
    prompt_id: int, 
    db: Session = Depends(get_db)
) -> dict[str, str | int]:
    """Delete a prompt"""
    prompt = get_or_404(db, Prompt, prompt_id, "Prompt not found")
    db.delete(prompt)
    db.commit()
    
    return {"message": "Prompt deleted successfully", "id": prompt_id}

