from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel
import json

from app.database import get_db
from app.models.prompt import Prompt
from app.models.csv_data import CSVRow, CSVFile
from app.models.evaluation import Evaluation
from app.services.llm_service import llm_service
from app.schemas.evaluation import EvaluationResponse


router = APIRouter()


class RunPromptRequest(BaseModel):
    prompt_id: int
    csv_row_id: int
    model: str = "gpt-5-mini"
    temperature: float = 1.0
    max_tokens: int = 2000


@router.post("/run", response_model=EvaluationResponse)
async def run_prompt(
    request: RunPromptRequest,
    db: Session = Depends(get_db)
):
    """
    Run a prompt through an LLM for a specific CSV row.
    Returns the complete response and saves it to the evaluation output.
    """
    # Verify prompt exists
    prompt = db.query(Prompt).filter(Prompt.id == request.prompt_id).first()
    if not prompt:
        raise HTTPException(status_code=404, detail="Prompt not found")
    
    # Verify CSV row exists
    csv_row = db.query(CSVRow).filter(CSVRow.id == request.csv_row_id).first()
    if not csv_row:
        raise HTTPException(status_code=404, detail="CSV row not found")
    
    # Get CSV file to access column names for validation
    csv_file = db.query(CSVFile).filter(CSVFile.id == csv_row.csv_file_id).first()
    if not csv_file:
        raise HTTPException(status_code=404, detail="CSV file not found")
    
    # Parse row data
    try:
        row_data = json.loads(csv_row.row_data)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid row data format")
    
    # Parse CSV file columns
    try:
        available_columns = json.loads(csv_file.columns) if isinstance(csv_file.columns, str) else csv_file.columns
    except (json.JSONDecodeError, TypeError):
        available_columns = None
    
    # Render the prompt template with row data and validate column names
    try:
        rendered_prompt = llm_service.render_prompt(prompt.content, row_data, available_columns)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    # Get or create evaluation
    evaluation = db.query(Evaluation).filter(
        Evaluation.csv_row_id == request.csv_row_id
    ).first()
    
    if not evaluation:
        evaluation = Evaluation(
            csv_file_id=csv_row.csv_file_id,
            csv_row_id=request.csv_row_id,
            output="",
        )
        db.add(evaluation)
        db.commit()
        db.refresh(evaluation)
    
    # Get completion from LLM
    try:
        output = await llm_service.completion(
            rendered_prompt,
            model=request.model,
            temperature=request.temperature,
            max_completion_tokens=request.max_tokens,
        )
        
        # Save the output to the database
        evaluation.output = output if output else ""
        db.commit()
        db.refresh(evaluation)
        
        return evaluation
        
    except Exception as e:
        # Rollback on error
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error calling LLM: {str(e)}")

