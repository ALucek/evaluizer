from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional

from app.database import get_db
from app.models.prompt import Prompt
from app.models.csv_data import CSVFile
from app.schemas.prompt import (
    PromptResponse,
    CreatePromptRequest,
    UpdatePromptRequest
)

router = APIRouter()


@router.post("/", response_model=PromptResponse)
async def create_prompt(
    request: CreatePromptRequest,
    db: Session = Depends(get_db)
):
    """Create a new prompt"""
    # Verify CSV file exists if csv_file_id is provided
    if request.csv_file_id:
        csv_file = db.query(CSVFile).filter(CSVFile.id == request.csv_file_id).first()
        if not csv_file:
            raise HTTPException(status_code=404, detail="CSV file not found")
    
    prompt = Prompt(
        name=request.name,
        content=request.content,
        csv_file_id=request.csv_file_id
    )
    
    db.add(prompt)
    db.commit()
    db.refresh(prompt)
    
    return prompt


@router.get("/", response_model=List[PromptResponse])
async def list_prompts(
    csv_file_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """List all prompts, optionally filtered by CSV file"""
    query = db.query(Prompt)
    
    if csv_file_id:
        query = query.filter(Prompt.csv_file_id == csv_file_id)
    
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

