"""Endpoints for function evaluation configs and results."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from sqlalchemy import and_

from app.database import get_db
from app.models.function_eval import FunctionEvalConfig, FunctionEvalResult
from app.models.csv_data import CSVFile, CSVRow
from app.models.evaluation import Evaluation
from app.services.function_eval_service import validate_function_name, run_function_evaluation
from app.utils import parse_json_safe, get_or_404
from app.schemas.function_eval import (
    FunctionEvalConfigResponse,
    CreateFunctionEvalConfigRequest,
    UpdateFunctionEvalConfigRequest,
    FunctionEvalResultResponse,
    RunFunctionEvalRequest
)

router = APIRouter()


@router.get("/configs", response_model=List[FunctionEvalConfigResponse])
async def list_function_eval_configs(
    csv_file_id: int,
    db: Session = Depends(get_db)
) -> List[FunctionEvalConfigResponse]:
    """List all function eval configs for a CSV file"""
    get_or_404(db, CSVFile, csv_file_id, "CSV file not found")
    
    configs = db.query(FunctionEvalConfig).filter(
        FunctionEvalConfig.csv_file_id == csv_file_id
    ).order_by(FunctionEvalConfig.created_at.desc()).all()
    
    return configs


@router.post("/configs", response_model=FunctionEvalConfigResponse)
async def create_function_eval_config(
    request: CreateFunctionEvalConfigRequest,
    db: Session = Depends(get_db)
) -> FunctionEvalConfigResponse:
    """Create a new function eval config (validate name uniqueness per CSV file and function_name exists)"""
    get_or_404(db, CSVFile, request.csv_file_id, "CSV file not found")
    
    # Validate that the function_name exists in the registry
    try:
        validate_function_name(request.function_name)
    except KeyError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    # Check if name already exists for this CSV file
    existing = db.query(FunctionEvalConfig).filter(
        and_(
            FunctionEvalConfig.csv_file_id == request.csv_file_id,
            FunctionEvalConfig.name == request.name
        )
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Function eval config with name '{request.name}' already exists for this CSV file"
        )
    
    try:
        config = FunctionEvalConfig(
            csv_file_id=request.csv_file_id,
            name=request.name,
            function_name=request.function_name,
            config=request.config
        )
        
        db.add(config)
        db.commit()
        db.refresh(config)
        
        return config
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error creating function eval config: {str(e)}")


@router.put("/configs/{config_id}", response_model=FunctionEvalConfigResponse)
async def update_function_eval_config(
    config_id: int,
    request: UpdateFunctionEvalConfigRequest,
    db: Session = Depends(get_db)
) -> FunctionEvalConfigResponse:
    """Update a function eval config (name or config)"""
    config = get_or_404(db, FunctionEvalConfig, config_id, "Function eval config not found")
    
    # If updating name, check uniqueness
    if request.name is not None and request.name != config.name:
        existing = db.query(FunctionEvalConfig).filter(
            and_(
                FunctionEvalConfig.csv_file_id == config.csv_file_id,
                FunctionEvalConfig.name == request.name,
                FunctionEvalConfig.id != config_id
            )
        ).first()
        
        if existing:
            raise HTTPException(
                status_code=400,
                detail=f"Function eval config with name '{request.name}' already exists for this CSV file"
            )
    
    # Update fields that were provided
    if request.name is not None:
        config.name = request.name
    if request.config is not None:
        config.config = request.config
    
    try:
        db.commit()
        db.refresh(config)
        return config
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error updating function eval config: {str(e)}")


@router.delete("/configs/{config_id}")
async def delete_function_eval_config(
    config_id: int,
    db: Session = Depends(get_db)
) -> dict[str, str | int]:
    """Delete a function eval config (cascades to delete all its results)"""
    config = get_or_404(db, FunctionEvalConfig, config_id, "Function eval config not found")
    
    db.delete(config)
    db.commit()
    
    return {"message": "Function eval config deleted successfully", "id": config_id}


# Result endpoints

@router.get("/results/csv/{csv_id}", response_model=List[FunctionEvalResultResponse])
async def get_function_eval_results_for_csv(
    csv_id: int,
    db: Session = Depends(get_db)
) -> List[FunctionEvalResultResponse]:
    """Get all function eval results for a CSV file"""
    get_or_404(db, CSVFile, csv_id, "CSV file not found")
    
    results = db.query(FunctionEvalResult).filter(
        FunctionEvalResult.csv_file_id == csv_id
    ).all()
    
    return results


@router.post("/run", response_model=FunctionEvalResultResponse)
async def run_function_eval(
    request: RunFunctionEvalRequest,
    db: Session = Depends(get_db)
) -> FunctionEvalResultResponse:
    """
    Run a function evaluation for a specific CSV row.
    Loads row data and evaluation output, calls the function evaluation, and stores the result.
    """
    # Get function eval config
    config = get_or_404(db, FunctionEvalConfig, request.config_id, "Function eval config not found")
    
    # Get CSV row
    csv_row = get_or_404(db, CSVRow, request.csv_row_id, "CSV row not found")
    
    # Verify row belongs to the same CSV file as the config
    if csv_row.csv_file_id != config.csv_file_id:
        raise HTTPException(
            status_code=400,
            detail="CSV row does not belong to the same CSV file as the function eval config"
        )
    
    # Parse row data
    row_data = parse_json_safe(csv_row.row_data, {})
    if not row_data:
        raise HTTPException(status_code=400, detail="Invalid row data format")
    
    # Get evaluation output for this row (if exists)
    evaluation = db.query(Evaluation).filter(
        Evaluation.csv_row_id == request.csv_row_id
    ).first()
    
    output = None
    if evaluation and evaluation.output:
        output = evaluation.output
    
    # Run the function evaluation
    try:
        result_dict = run_function_evaluation(
            name=config.function_name,
            row=row_data,
            output=output,
            config=config.config
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error running function evaluation: {str(e)}"
        )
    
    # Convert score to float (handle int/bool from plugins)
    score = float(result_dict["score"])
    details = result_dict.get("details")
    
    # Get or create function eval result (upsert)
    result = db.query(FunctionEvalResult).filter(
        and_(
            FunctionEvalResult.config_id == config.id,
            FunctionEvalResult.csv_row_id == request.csv_row_id
        )
    ).first()
    
    if result:
        # Update existing result
        result.score = score
        result.details = details
    else:
        # Create new result
        result = FunctionEvalResult(
            config_id=config.id,
            csv_file_id=csv_row.csv_file_id,
            csv_row_id=request.csv_row_id,
            score=score,
            details=details
        )
        db.add(result)
    
    try:
        db.commit()
        db.refresh(result)
        return result
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error saving function eval result: {str(e)}")


@router.delete("/results/config/{config_id}/row/{row_id}")
async def delete_function_eval_result(
    config_id: int,
    row_id: int,
    db: Session = Depends(get_db)
) -> dict[str, str | int]:
    """Delete a function eval result for a specific config and row (idempotent)"""
    result = db.query(FunctionEvalResult).filter(
        and_(
            FunctionEvalResult.config_id == config_id,
            FunctionEvalResult.csv_row_id == row_id
        )
    ).first()
    
    if result:
        db.delete(result)
        db.commit()
    
    return {"message": "Function eval result deleted successfully", "config_id": config_id, "row_id": row_id}


@router.delete("/results/config/{config_id}")
async def delete_function_eval_results_for_config(
    config_id: int,
    db: Session = Depends(get_db)
) -> dict[str, str | int]:
    """Delete all function eval results for a specific config"""
    get_or_404(db, FunctionEvalConfig, config_id, "Function eval config not found")
    
    deleted_count = db.query(FunctionEvalResult).filter(
        FunctionEvalResult.config_id == config_id
    ).delete()
    
    db.commit()
    
    return {
        "message": f"Deleted {deleted_count} function eval result(s)",
        "config_id": config_id,
        "deleted_count": deleted_count
    }

