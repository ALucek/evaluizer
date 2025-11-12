from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional

from app.database import get_db
from app.models.evaluation import Evaluation
from app.models.csv_data import CSVFile, CSVRow
from app.utils import get_or_404
from app.schemas.evaluation import (
    EvaluationResponse,
    UpdateEvaluationRequest,
    CreateEvaluationRequest
)

router = APIRouter()


@router.post("/", response_model=EvaluationResponse)
async def create_evaluation(
    request: CreateEvaluationRequest,
    db: Session = Depends(get_db)
):
    """Create a new evaluation for a CSV row"""
    # Verify CSV row exists
    csv_row = get_or_404(db, CSVRow, request.csv_row_id, "CSV row not found")
    
    # Check if evaluation already exists
    existing = db.query(Evaluation).filter(Evaluation.csv_row_id == request.csv_row_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Evaluation already exists for this row")
    
    evaluation = Evaluation(
        csv_file_id=csv_row.csv_file_id,
        csv_row_id=request.csv_row_id,
        output=request.output,
        annotation=request.annotation,
        feedback=request.feedback
    )
    
    db.add(evaluation)
    db.commit()
    db.refresh(evaluation)
    
    return evaluation


@router.get("/csv/{csv_id}", response_model=List[EvaluationResponse])
async def get_evaluations_for_csv(csv_id: int, db: Session = Depends(get_db)):
    """Get all evaluations for a CSV file"""
    get_or_404(db, CSVFile, csv_id, "CSV file not found")
    
    evaluations = db.query(Evaluation).filter(Evaluation.csv_file_id == csv_id).all()
    return evaluations


@router.get("/row/{row_id}", response_model=EvaluationResponse)
async def get_evaluation_for_row(row_id: int, db: Session = Depends(get_db)):
    """Get evaluation for a specific CSV row"""
    evaluation = db.query(Evaluation).filter(Evaluation.csv_row_id == row_id).first()
    if not evaluation:
        raise HTTPException(status_code=404, detail="Evaluation not found for this row")
    
    return evaluation


@router.patch("/row/{row_id}", response_model=EvaluationResponse)
async def update_evaluation(
    row_id: int,
    request: UpdateEvaluationRequest,
    db: Session = Depends(get_db)
):
    """Update evaluation for a specific CSV row (creates if doesn't exist)"""
    evaluation = db.query(Evaluation).filter(Evaluation.csv_row_id == row_id).first()
    
    if not evaluation:
        # Create evaluation if it doesn't exist
        csv_row = get_or_404(db, CSVRow, row_id, "CSV row not found")
        
        evaluation = Evaluation(
            csv_file_id=csv_row.csv_file_id,
            csv_row_id=row_id,
            output=request.output,
            annotation=request.annotation,
            feedback=request.feedback
        )
        db.add(evaluation)
    else:
        # Update existing evaluation - only update fields that were explicitly provided
        request_dict = request.model_dump(exclude_unset=True)
        for field in ['output', 'annotation', 'feedback']:
            if field in request_dict:
                setattr(evaluation, field, request_dict[field])
    
    db.commit()
    db.refresh(evaluation)
    
    return evaluation


@router.delete("/row/{row_id}")
async def delete_evaluation(row_id: int, db: Session = Depends(get_db)):
    """Delete evaluation for a specific CSV row"""
    evaluation = db.query(Evaluation).filter(Evaluation.csv_row_id == row_id).first()
    if not evaluation:
        raise HTTPException(status_code=404, detail="Evaluation not found")
    
    db.delete(evaluation)
    db.commit()
    
    return {"message": "Evaluation deleted successfully", "row_id": row_id}

