from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from sqlalchemy import and_

from app.database import get_db
from app.models.judge import JudgeConfig, JudgeResult
from app.models.csv_data import CSVFile, CSVRow
from app.models.evaluation import Evaluation
from app.utils import parse_json_safe, get_or_404
from app.services.judge_service import run_judge_evaluation
from app.schemas.judge import (
    JudgeConfigResponse,
    CreateJudgeConfigRequest,
    UpdateJudgeConfigRequest,
    JudgeResultResponse,
    JudgeRunRequest
)

router = APIRouter()


@router.get("/configs", response_model=List[JudgeConfigResponse])
async def list_judge_configs(
    csv_file_id: int,
    db: Session = Depends(get_db)
) -> List[JudgeConfigResponse]:
    """List all judge configs for a CSV file"""
    get_or_404(db, CSVFile, csv_file_id, "CSV file not found")
    
    configs = db.query(JudgeConfig).filter(
        JudgeConfig.csv_file_id == csv_file_id
    ).order_by(JudgeConfig.created_at.desc()).all()
    
    return configs


@router.post("/configs", response_model=JudgeConfigResponse)
async def create_judge_config(
    request: CreateJudgeConfigRequest,
    db: Session = Depends(get_db)
) -> JudgeConfigResponse:
    """Create a new judge config (validate name uniqueness per CSV file)"""
    get_or_404(db, CSVFile, request.csv_file_id, "CSV file not found")
    
    # Check if name already exists for this CSV file
    existing = db.query(JudgeConfig).filter(
        and_(
            JudgeConfig.csv_file_id == request.csv_file_id,
            JudgeConfig.name == request.name
        )
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Judge config with name '{request.name}' already exists for this CSV file"
        )
    
    try:
        config = JudgeConfig(
            csv_file_id=request.csv_file_id,
            name=request.name,
            prompt=request.prompt,
            model=request.model,
            temperature=request.temperature,
            max_tokens=request.max_tokens
        )
        
        db.add(config)
        db.commit()
        db.refresh(config)
        
        return config
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error creating judge config: {str(e)}")


@router.put("/configs/{config_id}", response_model=JudgeConfigResponse)
async def update_judge_config(
    config_id: int,
    request: UpdateJudgeConfigRequest,
    db: Session = Depends(get_db)
) -> JudgeConfigResponse:
    """Update a judge config (name, prompt, or LLM config)"""
    config = get_or_404(db, JudgeConfig, config_id, "Judge config not found")
    
    # If updating name, check uniqueness
    if request.name is not None and request.name != config.name:
        existing = db.query(JudgeConfig).filter(
            and_(
                JudgeConfig.csv_file_id == config.csv_file_id,
                JudgeConfig.name == request.name,
                JudgeConfig.id != config_id
            )
        ).first()
        
        if existing:
            raise HTTPException(
                status_code=400,
                detail=f"Judge config with name '{request.name}' already exists for this CSV file"
            )
    
    # Update fields that were provided
    if request.name is not None:
        config.name = request.name
    if request.prompt is not None:
        config.prompt = request.prompt
    if request.model is not None:
        config.model = request.model
    if request.temperature is not None:
        config.temperature = request.temperature
    if request.max_tokens is not None:
        config.max_tokens = request.max_tokens
    
    try:
        db.commit()
        db.refresh(config)
        return config
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error updating judge config: {str(e)}")


@router.delete("/configs/{config_id}")
async def delete_judge_config(
    config_id: int,
    db: Session = Depends(get_db)
) -> dict[str, str | int]:
    """Delete a judge config (cascades to delete all its results)"""
    config = get_or_404(db, JudgeConfig, config_id, "Judge config not found")
    
    db.delete(config)
    db.commit()
    
    return {"message": "Judge config deleted successfully", "id": config_id}


@router.get("/results/csv/{csv_id}", response_model=List[JudgeResultResponse])
async def get_judge_results_for_csv(
    csv_id: int,
    prompt_id: int,
    db: Session = Depends(get_db)
) -> List[JudgeResultResponse]:
    """Get all judge results for a CSV file and prompt"""
    get_or_404(db, CSVFile, csv_id, "CSV file not found")
    
    results = db.query(JudgeResult).filter(
        JudgeResult.csv_file_id == csv_id,
        JudgeResult.prompt_id == prompt_id
    ).all()
    
    return results


@router.post("/run", response_model=JudgeResultResponse)
async def run_judge(
    request: JudgeRunRequest,
    db: Session = Depends(get_db)
) -> JudgeResultResponse:
    """
    Run a judge evaluation for a specific CSV row.
    Builds the judge prompt, calls the LLM, parses the score, and stores the result.
    """
    # Get judge config
    config = get_or_404(db, JudgeConfig, request.config_id, "Judge config not found")
    
    # Get CSV row
    csv_row = get_or_404(db, CSVRow, request.csv_row_id, "CSV row not found")
    
    # Verify row belongs to the same CSV file as the config
    if csv_row.csv_file_id != config.csv_file_id:
        raise HTTPException(
            status_code=400,
            detail="CSV row does not belong to the same CSV file as the judge config"
        )
    
    # Get CSV file to access column names
    csv_file = get_or_404(db, CSVFile, csv_row.csv_file_id, "CSV file not found")
    
    # Parse row data
    row_data = parse_json_safe(csv_row.row_data, {})
    if not row_data:
        raise HTTPException(status_code=400, detail="Invalid row data format")
    
    # Get evaluation output for this row and prompt (if exists)
    evaluation = db.query(Evaluation).filter(
        Evaluation.csv_row_id == request.csv_row_id,
        Evaluation.prompt_id == request.prompt_id
    ).first()
    
    output = evaluation.output if evaluation and evaluation.output else ""
    
    # Parse CSV file columns
    available_columns = parse_json_safe(csv_file.columns, None) or []
    
    # Run judge evaluation with retries
    raw_output = None
    score = None
    max_retries = 3
    
    for attempt in range(max_retries):
        try:
            score, raw_output = await run_judge_evaluation(
                config,
                row_data,
                output,
                available_columns
            )
            break
        except ValueError as e:
            # Score parsing failed - retry if we have attempts left
            if attempt < max_retries - 1:
                continue
            else:
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to parse score from LLM output after {max_retries} attempts: {str(e)}"
                )
        except Exception as e:
            # LLM call failed - retry if we have attempts left
            if attempt < max_retries - 1:
                continue
            else:
                raise HTTPException(
                    status_code=500,
                    detail=f"Error calling LLM after {max_retries} attempts: {str(e)}"
                )
    
    # Verify prompt exists
    from app.models.prompt import Prompt
    get_or_404(db, Prompt, request.prompt_id, "Prompt not found")
    
    # Get or create judge result (upsert)
    result = db.query(JudgeResult).filter(
        and_(
            JudgeResult.config_id == config.id,
            JudgeResult.csv_row_id == request.csv_row_id,
            JudgeResult.prompt_id == request.prompt_id
        )
    ).first()
    
    if result:
        # Update existing result
        result.score = score
        result.raw_output = raw_output
    else:
        # Create new result
        result = JudgeResult(
            config_id=config.id,
            csv_file_id=csv_row.csv_file_id,
            csv_row_id=request.csv_row_id,
            prompt_id=request.prompt_id,
            score=score,
            raw_output=raw_output
        )
        db.add(result)
    
    try:
        db.commit()
        db.refresh(result)
        return result
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error saving judge result: {str(e)}")


@router.delete("/results/config/{config_id}/row/{row_id}")
async def delete_judge_result(
    config_id: int,
    row_id: int,
    prompt_id: int,
    db: Session = Depends(get_db)
) -> dict[str, str | int]:
    """Delete a judge result for a specific config, row, and prompt"""
    result = db.query(JudgeResult).filter(
        and_(
            JudgeResult.config_id == config_id,
            JudgeResult.csv_row_id == row_id,
            JudgeResult.prompt_id == prompt_id
        )
    ).first()
    
    if result:
        db.delete(result)
        db.commit()
    
    return {"message": "Judge result deleted successfully", "config_id": config_id, "row_id": row_id, "prompt_id": prompt_id}


@router.delete("/results/config/{config_id}")
async def delete_judge_results_for_config(
    config_id: int,
    prompt_id: Optional[int] = None,
    db: Session = Depends(get_db)
) -> dict[str, str | int]:
    """Delete all judge results for a specific config"""
    get_or_404(db, JudgeConfig, config_id, "Judge config not found")
    
    query = db.query(JudgeResult).filter(
        JudgeResult.config_id == config_id
    )
    
    # If prompt_id is provided, only delete results for that prompt version
    if prompt_id is not None:
        from app.models.prompt import Prompt
        get_or_404(db, Prompt, prompt_id, "Prompt not found")
        query = query.filter(JudgeResult.prompt_id == prompt_id)
    
    deleted_count = query.delete()
    
    db.commit()
    
    return {
        "message": f"Deleted {deleted_count} judge result(s)",
        "config_id": config_id,
        "prompt_id": prompt_id,
        "deleted_count": deleted_count
    }
