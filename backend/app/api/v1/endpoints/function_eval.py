"""Endpoints for function-based evaluations."""

from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import and_

from app.database import get_db
from app.models.function_eval import FunctionEvalConfig, FunctionEvalResult
from app.models.csv_data import CSVFile, CSVRow
from app.models.evaluation import Evaluation
from app.models.prompt import Prompt
from app.services.function_eval_service import (
    list_function_evaluations,
    run_function_evaluation,
    validate_function_name
)
from app.schemas.function_eval import (
    FunctionEvaluationInfo,
    RunFunctionEvaluationRequest,
    FunctionEvaluationResult as FunctionEvaluationResultSchema,
    FunctionEvalConfigResponse,
    CreateFunctionEvalConfigRequest,
    UpdateFunctionEvalConfigRequest,
    FunctionEvalResultResponse,
    RunFunctionEvalRequest
)
from app.utils import parse_json_safe, get_or_404

router = APIRouter()

# --- Plugin Discovery & Testing ---

@router.get("/plugins", response_model=List[FunctionEvaluationInfo])
async def list_function_evaluations_endpoint() -> List[FunctionEvaluationInfo]:
    """
    List all available function-based evaluation plugins.
    """
    try:
        evaluations = list_function_evaluations()
        return [
            FunctionEvaluationInfo(**eval_info)
            for eval_info in evaluations
        ]
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list function evaluations: {str(e)}"
        )


@router.post("/test", response_model=FunctionEvaluationResultSchema)
async def test_function_evaluation_endpoint(
    request: RunFunctionEvaluationRequest
) -> FunctionEvaluationResultSchema:
    """
    Test a function-based evaluation on a row and output (dry run, no persistence).
    """
    try:
        result = run_function_evaluation(
            name=request.evaluation_name,
            row=request.row,
            output=request.output,
            config=request.config
        )
        return FunctionEvaluationResultSchema(**result)
    except KeyError as e:
        raise HTTPException(
            status_code=404,
            detail=str(e)
        )
    except RuntimeError as e:
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Unexpected error running function evaluation: {str(e)}"
        )


# --- Configuration Management ---

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
    """Create a new function eval config"""
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
    """Update a function eval config"""
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
    """Delete a function eval config"""
    config = get_or_404(db, FunctionEvalConfig, config_id, "Function eval config not found")
    
    db.delete(config)
    db.commit()
    
    return {"message": "Function eval config deleted successfully", "id": config_id}


# --- Results Management ---

@router.get("/results/csv/{csv_id}", response_model=List[FunctionEvalResultResponse])
async def get_function_eval_results_for_csv(
    csv_id: int,
    prompt_id: int,
    db: Session = Depends(get_db)
) -> List[FunctionEvalResultResponse]:
    """Get all function eval results for a CSV file and prompt"""
    get_or_404(db, CSVFile, csv_id, "CSV file not found")
    
    results = db.query(FunctionEvalResult).filter(
        FunctionEvalResult.csv_file_id == csv_id,
        FunctionEvalResult.prompt_id == prompt_id
    ).all()
    
    return results


@router.post("/run", response_model=FunctionEvalResultResponse)
async def run_function_eval(
    request: RunFunctionEvalRequest,
    db: Session = Depends(get_db)
) -> FunctionEvalResultResponse:
    """
    Run a configured function evaluation for a specific CSV row and persist the result.
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
    
    # Get evaluation output for this row and prompt (if exists)
    evaluation = db.query(Evaluation).filter(
        Evaluation.csv_row_id == request.csv_row_id,
        Evaluation.prompt_id == request.prompt_id
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
    
    # Verify prompt exists
    get_or_404(db, Prompt, request.prompt_id, "Prompt not found")
    
    # Get or create function eval result (upsert)
    result = db.query(FunctionEvalResult).filter(
        and_(
            FunctionEvalResult.config_id == config.id,
            FunctionEvalResult.csv_row_id == request.csv_row_id,
            FunctionEvalResult.prompt_id == request.prompt_id
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
            prompt_id=request.prompt_id,
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
    prompt_id: int,
    db: Session = Depends(get_db)
) -> dict[str, str | int]:
    """Delete a function eval result for a specific config, row, and prompt (idempotent)"""
    result = db.query(FunctionEvalResult).filter(
        and_(
            FunctionEvalResult.config_id == config_id,
            FunctionEvalResult.csv_row_id == row_id,
            FunctionEvalResult.prompt_id == prompt_id
        )
    ).first()
    
    if result:
        db.delete(result)
        db.commit()
    
    return {"message": "Function eval result deleted successfully", "config_id": config_id, "row_id": row_id, "prompt_id": prompt_id}


@router.delete("/results/config/{config_id}")
async def delete_function_eval_results_for_config(
    config_id: int,
    prompt_id: Optional[int] = None,
    db: Session = Depends(get_db)
) -> dict[str, str | int]:
    """Delete all function eval results for a specific config, optionally filtered by prompt_id"""
    get_or_404(db, FunctionEvalConfig, config_id, "Function eval config not found")
    
    query = db.query(FunctionEvalResult).filter(
        FunctionEvalResult.config_id == config_id
    )
    
    # If prompt_id is provided, only delete results for that prompt version
    if prompt_id is not None:
        get_or_404(db, Prompt, prompt_id, "Prompt not found")
        query = query.filter(FunctionEvalResult.prompt_id == prompt_id)
    
    deleted_count = query.delete()
    
    db.commit()
    
    return {
        "message": f"Deleted {deleted_count} function eval result(s)",
        "config_id": config_id,
        "prompt_id": prompt_id,
        "deleted_count": deleted_count
    }
