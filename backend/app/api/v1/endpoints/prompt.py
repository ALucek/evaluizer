from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional, Dict
from collections import defaultdict

from app.database import get_db
from app.models.prompt import Prompt
from app.models.csv_data import CSVFile
from app.schemas.prompt import (
    PromptResponse,
    CreatePromptRequest,
    UpdatePromptRequest,
    CreateVersionRequest
)

router = APIRouter()


def get_root_prompt_id(db: Session, prompt_id: int) -> int:
    """Helper function to find the root prompt ID"""
    prompt = db.query(Prompt).filter(Prompt.id == prompt_id).first()
    if not prompt:
        return prompt_id
    
    current_id = prompt_id
    while prompt and prompt.parent_prompt_id:
        current_id = prompt.parent_prompt_id
        prompt = db.query(Prompt).filter(Prompt.id == current_id).first()
    
    return current_id


@router.post("/", response_model=PromptResponse)
async def create_prompt(
    request: CreatePromptRequest,
    db: Session = Depends(get_db)
):
    """Create a new prompt or a new version of an existing prompt"""
    # Verify CSV file exists if csv_file_id is provided
    if request.csv_file_id:
        csv_file = db.query(CSVFile).filter(CSVFile.id == request.csv_file_id).first()
        if not csv_file:
            raise HTTPException(status_code=404, detail="CSV file not found")
    
    # If parent_prompt_id is provided, create a new version
    if request.parent_prompt_id:
        parent_prompt = db.query(Prompt).filter(Prompt.id == request.parent_prompt_id).first()
        if not parent_prompt:
            raise HTTPException(status_code=404, detail="Parent prompt not found")
        
        # Find the root prompt ID
        root_prompt_id = get_root_prompt_id(db, request.parent_prompt_id)
        
        # Get the next version number (check all versions of the root prompt)
        max_version = db.query(func.max(Prompt.version)).filter(
            (Prompt.parent_prompt_id == root_prompt_id) | (Prompt.id == root_prompt_id)
        ).scalar() or 0
        
        version = max_version + 1
        
        prompt = Prompt(
            name=request.name or parent_prompt.name,
            content=request.content,
            csv_file_id=request.csv_file_id or parent_prompt.csv_file_id,
            parent_prompt_id=root_prompt_id,
            version=version,
            commit_message=request.commit_message
        )
    else:
        # Create a new root prompt (version 1)
        prompt = Prompt(
            name=request.name,
            content=request.content,
            csv_file_id=request.csv_file_id,
            version=1,
            commit_message=request.commit_message
        )
    
    db.add(prompt)
    db.commit()
    db.refresh(prompt)
    
    return prompt


@router.get("/", response_model=List[PromptResponse])
async def list_prompts(
    csv_file_id: Optional[int] = None,
    include_versions: bool = False,
    db: Session = Depends(get_db)
):
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
async def get_prompt(prompt_id: int, db: Session = Depends(get_db)):
    """Get a specific prompt by ID"""
    prompt = db.query(Prompt).filter(Prompt.id == prompt_id).first()
    if not prompt:
        raise HTTPException(status_code=404, detail="Prompt not found")
    
    return prompt


@router.put("/{prompt_id}", response_model=PromptResponse)
async def update_prompt(
    prompt_id: int,
    request: UpdatePromptRequest,
    db: Session = Depends(get_db)
):
    """Update a prompt"""
    prompt = db.query(Prompt).filter(Prompt.id == prompt_id).first()
    if not prompt:
        raise HTTPException(status_code=404, detail="Prompt not found")
    
    # Verify CSV file exists if csv_file_id is provided
    if request.csv_file_id is not None:
        if request.csv_file_id:
            csv_file = db.query(CSVFile).filter(CSVFile.id == request.csv_file_id).first()
            if not csv_file:
                raise HTTPException(status_code=404, detail="CSV file not found")
        prompt.csv_file_id = request.csv_file_id
    
    if request.name is not None:
        prompt.name = request.name
    
    if request.content is not None:
        prompt.content = request.content
    
    if request.commit_message is not None:
        prompt.commit_message = request.commit_message
    
    db.commit()
    db.refresh(prompt)
    
    return prompt


@router.get("/{prompt_id}/versions", response_model=List[PromptResponse])
async def list_prompt_versions(prompt_id: int, db: Session = Depends(get_db)):
    """List all versions of a prompt"""
    prompt = db.query(Prompt).filter(Prompt.id == prompt_id).first()
    if not prompt:
        raise HTTPException(status_code=404, detail="Prompt not found")
    
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
):
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
):
    """Create a new version of an existing prompt"""
    parent_prompt = db.query(Prompt).filter(Prompt.id == prompt_id).first()
    if not parent_prompt:
        raise HTTPException(status_code=404, detail="Prompt not found")
    
    # Get the root prompt ID
    root_prompt_id = get_root_prompt_id(db, prompt_id)
    
    # Get the next version number
    max_version = db.query(func.max(Prompt.version)).filter(
        (Prompt.parent_prompt_id == root_prompt_id) | (Prompt.id == root_prompt_id)
    ).scalar() or 0
    
    version = max_version + 1
    
    prompt = Prompt(
        name=request.name or parent_prompt.name,
        content=request.content,
        csv_file_id=parent_prompt.csv_file_id,
        parent_prompt_id=root_prompt_id,
        version=version,
        commit_message=request.commit_message
    )
    
    db.add(prompt)
    db.commit()
    db.refresh(prompt)
    
    return prompt


@router.delete("/{prompt_id}")
async def delete_prompt(prompt_id: int, db: Session = Depends(get_db)):
    """Delete a prompt"""
    prompt = db.query(Prompt).filter(Prompt.id == prompt_id).first()
    if not prompt:
        raise HTTPException(status_code=404, detail="Prompt not found")
    
    db.delete(prompt)
    db.commit()
    
    return {"message": "Prompt deleted successfully", "id": prompt_id}

