from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel

from app.database import get_db
from app.models.prompt import Prompt
from app.models.csv_data import CSVRow, CSVFile
from app.models.evaluation import Evaluation
from app.services.llm_service import llm_service
from app.utils import parse_json_safe, get_or_404
from app.schemas.evaluation import EvaluationResponse


router = APIRouter()


class RunPromptRequest(BaseModel):
    prompt_id: int
    csv_row_id: int
    model: str  # Any LiteLLM-supported model ID (e.g., 'gpt-4', 'azure/gpt-4', 'gemini/gemini-pro')
    temperature: float = 1.0
    max_tokens: int = 2000
    prompt_content: Optional[str] = None  # Optional override for prompt content (for unsaved edits)


@router.post("/run", response_model=EvaluationResponse)
async def run_prompt(
    request: RunPromptRequest,
    db: Session = Depends(get_db)
) -> EvaluationResponse:
    """
    Run a prompt through an LLM for a specific CSV row.
    Returns the complete response and saves it to the evaluation output.
    """
    # Verify prompt exists (still needed for validation even if using prompt_content override)
    prompt = get_or_404(db, Prompt, request.prompt_id, "Prompt not found")
    
    # Use provided prompt_content if available, otherwise use saved prompt content
    prompt_content = request.prompt_content if request.prompt_content is not None else prompt.content
    
    # Verify CSV row exists
    csv_row = get_or_404(db, CSVRow, request.csv_row_id, "CSV row not found")
    
    # Get CSV file to access column names for validation
    csv_file = get_or_404(db, CSVFile, csv_row.csv_file_id, "CSV file not found")
    
    # Parse row data
    row_data = parse_json_safe(csv_row.row_data, {})
    if not row_data:
        raise HTTPException(status_code=400, detail="Invalid row data format")
    
    # Parse CSV file columns
    available_columns = parse_json_safe(csv_file.columns, None)
    
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

