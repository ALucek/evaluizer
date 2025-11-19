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
    system_prompt: Optional[str] = None  # Optional override for system prompt (for unsaved edits)
    user_message_column: Optional[str] = None  # Optional override for user message column (for unsaved edits)


@router.post("/run", response_model=EvaluationResponse)
async def run_prompt(
    request: RunPromptRequest,
    db: Session = Depends(get_db)
) -> EvaluationResponse:
    """
    Run a prompt through an LLM for a specific CSV row.
    Returns the complete response and saves it to the evaluation output.
    """
    # Verify prompt exists (still needed for validation even if using overrides)
    prompt = get_or_404(db, Prompt, request.prompt_id, "Prompt not found")
    
    # Use provided overrides if available, otherwise use saved prompt values
    system_prompt = request.system_prompt if request.system_prompt is not None else prompt.system_prompt
    user_message_column = request.user_message_column if request.user_message_column is not None else prompt.user_message_column
    
    if not system_prompt:
        raise HTTPException(status_code=400, detail="System prompt is required")
    
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
    
    # Render the system prompt template with row data and validate column names
    try:
        rendered_system_prompt = llm_service.render_prompt(system_prompt, row_data, available_columns)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Error rendering system prompt: {str(e)}")
    
    # Get user message from the specified column
    if user_message_column:
        if available_columns and user_message_column not in available_columns:
            raise HTTPException(
                status_code=400,
                detail=f"User message column '{user_message_column}' not found. Available columns: {', '.join(available_columns)}"
            )
        user_message = str(row_data.get(user_message_column, ""))
        if not user_message.strip():
            raise HTTPException(
                status_code=400,
                detail=f"User message column '{user_message_column}' is empty for this row"
            )
    else:
        # If no user message column is specified, use empty string
        user_message = ""
    
    # Get or create evaluation
    evaluation = db.query(Evaluation).filter(
        Evaluation.csv_row_id == request.csv_row_id,
        Evaluation.prompt_id == request.prompt_id
    ).first()
    
    if not evaluation:
        evaluation = Evaluation(
            csv_file_id=csv_row.csv_file_id,
            csv_row_id=request.csv_row_id,
            prompt_id=request.prompt_id,
            output="",
        )
        db.add(evaluation)
        db.commit()
        db.refresh(evaluation)
    
    # Get completion from LLM with retries using chat format
    output = None
    max_retries = 3
    
    for attempt in range(max_retries):
        try:
            output = await llm_service.chat_completion(
                system_prompt=rendered_system_prompt,
                user_message=user_message,
                model=request.model,
                temperature=request.temperature,
                max_completion_tokens=request.max_tokens,
            )
            
            # Success - break out of retry loop
            break
            
        except Exception as e:
            # LLM call failed - retry if we have attempts left
            if attempt < max_retries - 1:
                continue
            else:
                # Rollback on final failure
                db.rollback()
                raise HTTPException(
                    status_code=500,
                    detail=f"Error calling LLM after {max_retries} attempts: {str(e)}"
                )
    
    # Ensure we have valid output
    if output is None:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get valid LLM output after {max_retries} attempts"
        )
    
    # Save the output to the database
    evaluation.output = output if output else ""
    db.commit()
    db.refresh(evaluation)
    
    return evaluation

