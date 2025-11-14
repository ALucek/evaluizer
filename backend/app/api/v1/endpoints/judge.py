from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from sqlalchemy import and_

from app.database import get_db
from app.models.judge import JudgeConfig, JudgeResult
from app.models.csv_data import CSVFile, CSVRow
from app.models.evaluation import Evaluation
from app.services.llm_service import llm_service
from app.utils import parse_json_safe, get_or_404
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
    db: Session = Depends(get_db)
) -> List[JudgeResultResponse]:
    """Get all judge results for a CSV file"""
    get_or_404(db, CSVFile, csv_id, "CSV file not found")
    
    results = db.query(JudgeResult).filter(
        JudgeResult.csv_file_id == csv_id
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
    
    # Get evaluation output for this row (if exists) and add it to row_data as "Output"
    evaluation = db.query(Evaluation).filter(
        Evaluation.csv_row_id == request.csv_row_id
    ).first()
    
    if evaluation and evaluation.output:
        row_data["Output"] = evaluation.output
    else:
        row_data["Output"] = ""
    
    # Parse CSV file columns and add "Output" to available columns
    available_columns = parse_json_safe(csv_file.columns, None) or []
    if "Output" not in available_columns:
        available_columns = list(available_columns) + ["Output"]
    
    # Build the complete judge prompt (prefix + core prompt + suffix, with variable substitution)
    try:
        complete_prompt = llm_service.build_judge_prompt(
            config.prompt,
            row_data,
            available_columns
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    # Get completion from LLM with retries
    raw_output = None
    score = None
    max_retries = 3
    
    for attempt in range(max_retries):
        try:
            # Get completion from LLM
            raw_output = await llm_service.completion(
                complete_prompt,
                model=config.model,
                temperature=config.temperature,
                max_completion_tokens=config.max_tokens,
            )
            
            # Parse the score from the output
            score = llm_service.parse_judge_score(raw_output)
            
            # Success - break out of retry loop
            break
            
        except ValueError as e:
            # Score parsing failed - retry if we have attempts left
            if attempt < max_retries - 1:
                continue
            else:
                # Include the actual raw_output in the error message for debugging
                output_preview = raw_output[:500] if raw_output else "(empty or None)"
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to parse score from LLM output after {max_retries} attempts: {str(e)}\n\nOutput received:\n{output_preview}"
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
    
    # Ensure we have valid output and score
    if raw_output is None or score is None:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get valid LLM output after {max_retries} attempts"
        )
    
    # Get or create judge result (upsert)
    result = db.query(JudgeResult).filter(
        and_(
            JudgeResult.config_id == config.id,
            JudgeResult.csv_row_id == request.csv_row_id
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
    db: Session = Depends(get_db)
) -> dict[str, str | int]:
    """Delete a judge result for a specific config and row (idempotent - returns success even if result doesn't exist)"""
    result = db.query(JudgeResult).filter(
        and_(
            JudgeResult.config_id == config_id,
            JudgeResult.csv_row_id == row_id
        )
    ).first()
    
    if result:
        db.delete(result)
        db.commit()
    
    return {"message": "Judge result deleted successfully", "config_id": config_id, "row_id": row_id}


@router.delete("/results/config/{config_id}")
async def delete_judge_results_for_config(
    config_id: int,
    db: Session = Depends(get_db)
) -> dict[str, str | int]:
    """Delete all judge results for a specific config"""
    get_or_404(db, JudgeConfig, config_id, "Judge config not found")
    
    deleted_count = db.query(JudgeResult).filter(
        JudgeResult.config_id == config_id
    ).delete()
    
    db.commit()
    
    return {
        "message": f"Deleted {deleted_count} judge result(s)",
        "config_id": config_id,
        "deleted_count": deleted_count
    }

