from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
import json

from app.database import get_db
from app.models.prompt import Prompt
from app.models.csv_data import CSVRow, CSVFile
from app.models.evaluation import Evaluation
from app.services.llm_service import llm_service
from app.schemas.evaluation import EvaluationResponse
from app.llm_config.llm_models import get_all_models, get_default_model


router = APIRouter()


class ModelInfo(BaseModel):
    """Model information for API responses"""
    id: str
    label: str
    provider: str
    default_temperature: float
    default_max_tokens: int
    supports_streaming: bool


@router.get("/models", response_model=List[ModelInfo])
async def get_available_models():
    """
    Get all available LLM models and their configurations.
    """
    models = get_all_models()
    return [
        ModelInfo(
            id=config.id,
            label=config.label,
            provider=config.provider,
            default_temperature=config.default_temperature,
            default_max_tokens=config.default_max_tokens,
            supports_streaming=config.supports_streaming,
        )
        for config in models.values()
    ]


@router.get("/models/default")
async def get_default_model_id():
    """
    Get the default model ID.
    """
    return {"model_id": get_default_model()}


class RunPromptRequest(BaseModel):
    prompt_id: int
    csv_row_id: int
    model: str = "gpt-5-mini"
    temperature: float = 1.0
    max_tokens: int = 2000
    prompt_content: Optional[str] = None  # Optional override for prompt content (for unsaved edits)


@router.post("/run", response_model=EvaluationResponse)
async def run_prompt(
    request: RunPromptRequest,
    db: Session = Depends(get_db)
):
    """
    Run a prompt through an LLM for a specific CSV row.
    Returns the complete response and saves it to the evaluation output.
    """
    # Verify prompt exists (still needed for validation even if using prompt_content override)
    prompt = db.query(Prompt).filter(Prompt.id == request.prompt_id).first()
    if not prompt:
        raise HTTPException(status_code=404, detail="Prompt not found")
    
    # Use provided prompt_content if available, otherwise use saved prompt content
    prompt_content = request.prompt_content if request.prompt_content is not None else prompt.content
    
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
        rendered_prompt = llm_service.render_prompt(prompt_content, row_data, available_columns)
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

