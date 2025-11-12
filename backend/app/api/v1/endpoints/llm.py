from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel
import json

from app.database import get_db
from app.models.prompt import Prompt
from app.models.csv_data import CSVRow
from app.models.evaluation import Evaluation
from app.services.llm_service import llm_service


router = APIRouter()


class RunPromptRequest(BaseModel):
    prompt_id: int
    csv_row_id: int
    model: str = "gpt-4o-mini"
    temperature: float = 0.7
    max_tokens: int = 2000


@router.post("/run")
async def run_prompt(
    request: RunPromptRequest,
    db: Session = Depends(get_db)
):
    """
    Run a prompt through an LLM for a specific CSV row.
    Streams the response back and saves it to the evaluation output.
    """
    # Verify prompt exists
    prompt = db.query(Prompt).filter(Prompt.id == request.prompt_id).first()
    if not prompt:
        raise HTTPException(status_code=404, detail="Prompt not found")
    
    # Verify CSV row exists
    csv_row = db.query(CSVRow).filter(CSVRow.id == request.csv_row_id).first()
    if not csv_row:
        raise HTTPException(status_code=404, detail="CSV row not found")
    
    # Parse row data
    try:
        row_data = json.loads(csv_row.row_data)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid row data format")
    
    # Render the prompt template with row data
    rendered_prompt = llm_service.render_prompt(prompt.content, row_data)
    
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
    
    # Stream the LLM response
    async def generate_response():
        accumulated_output = ""
        
        try:
            async for chunk in llm_service.stream_completion(
                rendered_prompt,
                model=request.model,
                temperature=request.temperature,
                max_tokens=request.max_tokens,
            ):
                accumulated_output += chunk
                # Send chunk as Server-Sent Events format
                yield f"data: {json.dumps({'chunk': chunk, 'row_id': request.csv_row_id})}\n\n"
            
            # Save the complete output to the database
            evaluation.output = accumulated_output
            db.commit()
            
            # Send completion signal
            yield f"data: {json.dumps({'done': True, 'row_id': request.csv_row_id, 'output': accumulated_output})}\n\n"
            
        except Exception as e:
            # Send error signal
            error_msg = str(e)
            yield f"data: {json.dumps({'error': error_msg, 'row_id': request.csv_row_id})}\n\n"
            # Try to rollback on error
            try:
                db.rollback()
            except Exception:
                pass
    
    return StreamingResponse(
        generate_response(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )

