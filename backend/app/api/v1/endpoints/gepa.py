"""GEPA Optimizer endpoints"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from sqlalchemy import and_

from app.database import get_db
from app.models.gepa import GepaConfig
from app.models.csv_data import CSVFile
from app.models.prompt import Prompt
from app.models.judge import JudgeConfig
from app.models.function_eval import FunctionEvalConfig
from app.utils import get_or_404
from app.schemas.gepa import (
    GepaConfigResponse,
    CreateGepaConfigRequest,
    UpdateGepaConfigRequest,
    RunGepaResponse
)
from app.services.gepa_service import run_gepa

router = APIRouter()


@router.get("/configs", response_model=List[GepaConfigResponse])
async def list_gepa_configs(
    csv_file_id: int,
    db: Session = Depends(get_db)
) -> List[GepaConfigResponse]:
    """List all GEPA configs for a CSV file"""
    get_or_404(db, CSVFile, csv_file_id, "CSV file not found")
    
    configs = db.query(GepaConfig).filter(
        GepaConfig.csv_file_id == csv_file_id
    ).order_by(GepaConfig.created_at.desc()).all()
    
    return configs


@router.post("/configs", response_model=GepaConfigResponse)
async def create_gepa_config(
    request: CreateGepaConfigRequest,
    db: Session = Depends(get_db)
) -> GepaConfigResponse:
    """Create a new GEPA config"""
    get_or_404(db, CSVFile, request.csv_file_id, "CSV file not found")
    
    # Validate base prompt (required)
    get_or_404(db, Prompt, request.base_prompt_id, "Base prompt not found")
    
    # Validate judge configs if provided
    if request.judge_config_ids:
        for config_id in request.judge_config_ids:
            judge_config = db.query(JudgeConfig).filter(JudgeConfig.id == config_id).first()
            if not judge_config:
                raise HTTPException(status_code=400, detail=f"Judge config {config_id} not found")
            if judge_config.csv_file_id != request.csv_file_id:
                raise HTTPException(
                    status_code=400,
                    detail=f"Judge config {config_id} does not belong to CSV file {request.csv_file_id}"
                )
    
    # Validate function eval configs if provided
    if request.function_eval_config_ids:
        for config_id in request.function_eval_config_ids:
            function_eval_config = db.query(FunctionEvalConfig).filter(
                FunctionEvalConfig.id == config_id
            ).first()
            if not function_eval_config:
                raise HTTPException(status_code=400, detail=f"Function eval config {config_id} not found")
            if function_eval_config.csv_file_id != request.csv_file_id:
                raise HTTPException(
                    status_code=400,
                    detail=f"Function eval config {config_id} does not belong to CSV file {request.csv_file_id}"
                )
    
    # Check if at least one evaluation config is provided
    if not request.judge_config_ids and not request.function_eval_config_ids:
        raise HTTPException(
            status_code=400,
            detail="At least one judge config or function eval config must be provided"
        )
    
    try:
        config = GepaConfig(
            csv_file_id=request.csv_file_id,
            name=request.name,
            base_prompt_id=request.base_prompt_id,
            judge_config_ids=request.judge_config_ids,
            function_eval_config_ids=request.function_eval_config_ids,
            reflection_model=request.reflection_model,
            generator_model=request.generator_model,
            max_metric_calls=request.max_metric_calls,
            custom_meta_prompt=request.custom_meta_prompt
        )
        
        db.add(config)
        db.commit()
        db.refresh(config)
        
        return config
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error creating GEPA config: {str(e)}")


@router.get("/configs/{config_id}", response_model=GepaConfigResponse)
async def get_gepa_config(
    config_id: int,
    db: Session = Depends(get_db)
) -> GepaConfigResponse:
    """Get a specific GEPA config"""
    return get_or_404(db, GepaConfig, config_id, "GEPA config not found")


@router.put("/configs/{config_id}", response_model=GepaConfigResponse)
async def update_gepa_config(
    config_id: int,
    request: UpdateGepaConfigRequest,
    db: Session = Depends(get_db)
) -> GepaConfigResponse:
    """Update a GEPA config"""
    config = get_or_404(db, GepaConfig, config_id, "GEPA config not found")
    
    # Validate base prompt if provided
    if request.base_prompt_id is not None:
        if request.base_prompt_id:
            get_or_404(db, Prompt, request.base_prompt_id, "Base prompt not found")
        config.base_prompt_id = request.base_prompt_id
    
    # Validate judge configs if provided
    if request.judge_config_ids is not None:
        for config_id_val in request.judge_config_ids:
            judge_config = db.query(JudgeConfig).filter(JudgeConfig.id == config_id_val).first()
            if not judge_config:
                raise HTTPException(status_code=400, detail=f"Judge config {config_id_val} not found")
            if judge_config.csv_file_id != config.csv_file_id:
                raise HTTPException(
                    status_code=400,
                    detail=f"Judge config {config_id_val} does not belong to CSV file {config.csv_file_id}"
                )
        config.judge_config_ids = request.judge_config_ids
    
    # Validate function eval configs if provided
    if request.function_eval_config_ids is not None:
        for config_id_val in request.function_eval_config_ids:
            function_eval_config = db.query(FunctionEvalConfig).filter(
                FunctionEvalConfig.id == config_id_val
            ).first()
            if not function_eval_config:
                raise HTTPException(status_code=400, detail=f"Function eval config {config_id_val} not found")
            if function_eval_config.csv_file_id != config.csv_file_id:
                raise HTTPException(
                    status_code=400,
                    detail=f"Function eval config {config_id_val} does not belong to CSV file {config.csv_file_id}"
                )
        config.function_eval_config_ids = request.function_eval_config_ids
    
    # Update other fields
    if request.name is not None:
        config.name = request.name
    if request.reflection_model is not None:
        config.reflection_model = request.reflection_model
    if request.generator_model is not None:
        config.generator_model = request.generator_model
    if request.max_metric_calls is not None:
        config.max_metric_calls = request.max_metric_calls
    if request.custom_meta_prompt is not None:
        config.custom_meta_prompt = request.custom_meta_prompt
    
    try:
        db.commit()
        db.refresh(config)
        return config
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error updating GEPA config: {str(e)}")


@router.delete("/configs/{config_id}")
async def delete_gepa_config(
    config_id: int,
    db: Session = Depends(get_db)
) -> dict[str, str | int]:
    """Delete a GEPA config"""
    config = get_or_404(db, GepaConfig, config_id, "GEPA config not found")
    
    db.delete(config)
    db.commit()
    
    return {"message": "GEPA config deleted successfully", "id": config_id}


@router.post("/configs/{config_id}/run", response_model=RunGepaResponse)
async def run_gepa_optimization_endpoint(
    config_id: int,
    db: Session = Depends(get_db)
) -> RunGepaResponse:
    """Run GEPA optimization for a config"""
    config = get_or_404(db, GepaConfig, config_id, "GEPA config not found")
    
    try:
        result = await run_gepa(db, config, config.csv_file_id)
        return RunGepaResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error running GEPA optimization: {str(e)}")

