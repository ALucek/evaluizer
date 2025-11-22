import nest_asyncio
nest_asyncio.apply()

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List
from sqlalchemy import and_
import asyncio
import json
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor

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
from app.services.gepa_progress import get_progress, update_progress, clear_progress

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
        # Default reflection_model to generator_model if not specified
        reflection_model = request.reflection_model if request.reflection_model is not None else request.generator_model
        
        config = GepaConfig(
            csv_file_id=request.csv_file_id,
            name=request.name,
            base_prompt_id=request.base_prompt_id,
            judge_config_ids=request.judge_config_ids,
            function_eval_config_ids=request.function_eval_config_ids,
            generator_model=request.generator_model,
            reflection_model=reflection_model,
            generator_temperature=request.generator_temperature,
            generator_max_tokens=request.generator_max_tokens,
            reflection_temperature=request.reflection_temperature,
            reflection_max_tokens=request.reflection_max_tokens,
            max_metric_calls=request.max_metric_calls
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
    if request.generator_model is not None:
        config.generator_model = request.generator_model
    if request.reflection_model is not None:
        config.reflection_model = request.reflection_model
    elif request.generator_model is not None:
        # If generator_model changed but reflection_model didn't, update reflection_model to match
        config.reflection_model = request.generator_model
    if request.generator_temperature is not None:
        config.generator_temperature = request.generator_temperature
    if request.generator_max_tokens is not None:
        config.generator_max_tokens = request.generator_max_tokens
    if request.reflection_temperature is not None:
        config.reflection_temperature = request.reflection_temperature
    if request.reflection_max_tokens is not None:
        config.reflection_max_tokens = request.reflection_max_tokens
    if request.max_metric_calls is not None:
        config.max_metric_calls = request.max_metric_calls
    
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


# Thread pool executor for running blocking optimization work
_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="gepa_optimizer")


def _run_gepa_sync(config_id: int, csv_file_id: int) -> None:
    """Run GEPA optimization synchronously in a thread"""
    # Suppress LiteLLM logging worker errors (they're harmless but noisy)
    import logging
    import warnings
    
    # Suppress asyncio warnings about unretrieved tasks
    logging.getLogger("asyncio").setLevel(logging.ERROR)
    warnings.filterwarnings("ignore", category=RuntimeWarning, message=".*coroutine.*was never awaited")
    warnings.filterwarnings("ignore", message=".*Task exception was never retrieved.*")
    
    # Disable LiteLLM logging/telemetry to reduce event loop conflicts
    import os
    os.environ.setdefault("LITELLM_LOG", "ERROR")
    os.environ.setdefault("LITELLM_TELEMETRY", "FALSE")
    
    # Try to configure LiteLLM to reduce worker activity
    try:
        import litellm
        litellm.set_verbose = False
        litellm.drop_params = True
        litellm.success_callback = []
        litellm.failure_callback = []
        litellm.callbacks = []
    except Exception:
        pass
    
    # nest_asyncio is already applied at module import time
    # Create a new database session for this thread
    from app.database import SessionLocal
    thread_db = SessionLocal()
    try:
        # Get config in the new session
        config = thread_db.query(GepaConfig).filter(GepaConfig.id == config_id).first()
        if not config:
            from app.services.gepa_progress import set_error
            set_error(config_id, "GEPA config not found")
            return
        
        # Run the optimization (this is blocking)
        # nest_asyncio allows this to work even if called from async context
        asyncio.run(run_gepa(thread_db, config, csv_file_id))
    except Exception as e:
        from app.services.gepa_progress import set_error
        set_error(config_id, f"Optimization failed: {str(e)}")
    finally:
        thread_db.close()


@router.post("/configs/{config_id}/run", response_model=RunGepaResponse)
async def run_gepa_optimization_endpoint(
    config_id: int,
    db: Session = Depends(get_db)
) -> RunGepaResponse:
    """Run GEPA optimization for a config (runs in background)"""
    config = get_or_404(db, GepaConfig, config_id, "GEPA config not found")
    
    # Check if optimization is already running
    current_progress = get_progress(config_id)
    if current_progress and current_progress.get("status") == "running":
        raise HTTPException(
            status_code=400,
            detail="Optimization is already running for this config"
        )
    
    # Initialize progress immediately so SSE can connect
    clear_progress(config_id)
    update_progress(
        config_id,
        status="running",
        current_iteration=0,
        max_iterations=config.max_metric_calls,
        message="Initializing optimization..."
    )
    
    # Run optimization in background thread pool to avoid blocking the event loop
    # Use get_running_loop() since we're in an async context
    loop = asyncio.get_running_loop()
    loop.run_in_executor(
        _executor,
        _run_gepa_sync,
        config_id,
        config.csv_file_id
    )
    
    # Return immediately - optimization is running in background
    return RunGepaResponse(
        best_prompt="",
        new_prompt_id=0,
        score=0.0,
        logs="Optimization started. Check progress endpoint for updates."
    )


@router.get("/configs/{config_id}/progress")
async def get_gepa_progress_stream(config_id: int):
    """Stream GEPA optimization progress via Server-Sent Events"""
    async def event_generator():
        last_progress = None
        # Send initial empty progress if none exists yet (to establish connection)
        initial_sent = False
        
        while True:
            progress = get_progress(config_id)
            
            # If progress exists and has changed, send update
            if progress:
                progress_json = json.dumps(progress)
                if progress_json != last_progress:
                    yield f"data: {progress_json}\n\n"
                    last_progress = progress_json
                    initial_sent = True
                    
                    # If completed or error, stop streaming
                    if progress.get("status") in ("completed", "error"):
                        break
            elif not initial_sent:
                # Send initial empty state to establish connection
                empty_progress = {
                    "status": "waiting",
                    "current_iteration": 0,
                    "max_iterations": 0,
                    "current_score": None,
                    "best_score": None,
                    "message": "Waiting for optimization to start...",
                    "updated_at": datetime.now().isoformat()
                }
                yield f"data: {json.dumps(empty_progress)}\n\n"
                initial_sent = True
            elif last_progress is not None:
                # Progress was cleared (optimization finished)
                break
            
            # Wait before checking again
            await asyncio.sleep(0.5)
        
        # Send final message
        yield f"data: {json.dumps({'status': 'closed'})}\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )

