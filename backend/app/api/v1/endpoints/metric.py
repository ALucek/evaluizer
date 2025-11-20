from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, cast, Float
from typing import List, Optional, Dict, Tuple

from app.database import get_db
from app.models.metric import Metric
from app.models.csv_data import CSVFile
from app.models.judge import JudgeResult, JudgeConfig
from app.models.function_eval import FunctionEvalResult, FunctionEvalConfig
from app.models.evaluation import Evaluation
from app.models.prompt import Prompt
from app.utils import get_or_404
from app.schemas.metric import (
    MetricResponse, 
    CreateMetricRequest, 
    UpdateMetricRequest,
    BestPromptsResponse,
    BestPromptInfo
)

router = APIRouter()


def _find_best_prompt(db: Session, prompt_scores: List[Tuple[int, float, int]]) -> Optional[BestPromptInfo]:
    """
    Helper function to find the best prompt from a list of (prompt_id, avg_score, count).
    Prefers higher score, then higher prompt_id (more recent).
    """
    if not prompt_scores:
        return None

    best_prompt_id = None
    best_avg_score = -1.0
    best_result_count = 0
    
    for prompt_id, avg_score, result_count in prompt_scores:
        # Handle potential None values or type mismatches
        current_score = float(avg_score) if avg_score is not None else 0.0
        
        if current_score > best_avg_score or (current_score == best_avg_score and prompt_id > best_prompt_id):
            best_prompt_id = prompt_id
            best_avg_score = current_score
            best_result_count = result_count
    
    if best_prompt_id:
        prompt = db.query(Prompt).filter(Prompt.id == best_prompt_id).first()
        if prompt:
            return BestPromptInfo(
                id=prompt.id,
                name=prompt.name,
                version=prompt.version,
                average_score=best_avg_score,
                result_count=best_result_count
            )
    
    return None


@router.get("/csv/{csv_file_id}/metrics", response_model=List[MetricResponse])
async def list_metrics(
    csv_file_id: int,
    db: Session = Depends(get_db)
) -> List[MetricResponse]:
    """List all metrics for a CSV file"""
    # Verify CSV file exists
    get_or_404(db, CSVFile, csv_file_id, "CSV file not found")
    
    metrics = db.query(Metric).filter(Metric.csv_file_id == csv_file_id).all()
    return metrics


@router.post("/metrics", response_model=MetricResponse)
async def create_metric(
    request: CreateMetricRequest,
    db: Session = Depends(get_db)
) -> MetricResponse:
    """Create or update a metric threshold"""
    # Verify CSV file exists
    get_or_404(db, CSVFile, request.csv_file_id, "CSV file not found")
    
    # Check if metric already exists
    existing_metric = db.query(Metric).filter(
        Metric.csv_file_id == request.csv_file_id,
        Metric.metric_type == request.metric_type,
        Metric.config_id == request.config_id
    ).first()
    
    if existing_metric:
        # Update existing metric
        existing_metric.threshold = request.threshold
        db.commit()
        db.refresh(existing_metric)
        return existing_metric
    else:
        # Create new metric
        metric = Metric(
            csv_file_id=request.csv_file_id,
            metric_type=request.metric_type,
            config_id=request.config_id,
            threshold=request.threshold
        )
        db.add(metric)
        db.commit()
        db.refresh(metric)
        return metric


@router.put("/metrics/{metric_id}", response_model=MetricResponse)
async def update_metric(
    metric_id: int,
    request: UpdateMetricRequest,
    db: Session = Depends(get_db)
) -> MetricResponse:
    """Update a metric threshold"""
    metric = get_or_404(db, Metric, metric_id, "Metric not found")
    
    metric.threshold = request.threshold
    db.commit()
    db.refresh(metric)
    return metric


@router.delete("/metrics/{metric_id}")
async def delete_metric(
    metric_id: int,
    db: Session = Depends(get_db)
):
    """Delete a metric"""
    metric = get_or_404(db, Metric, metric_id, "Metric not found")
    
    db.delete(metric)
    db.commit()
    return {"message": "Metric deleted successfully"}


@router.delete("/csv/{csv_file_id}/metrics")
async def delete_all_metrics(
    csv_file_id: int,
    db: Session = Depends(get_db)
):
    """Delete all metrics for a CSV file"""
    # Verify CSV file exists
    get_or_404(db, CSVFile, csv_file_id, "CSV file not found")
    
    db.query(Metric).filter(Metric.csv_file_id == csv_file_id).delete()
    db.commit()
    return {"message": "All metrics deleted successfully"}


@router.get("/metrics/{csv_file_id}/best-prompts", response_model=BestPromptsResponse)
async def get_best_prompts_for_metrics(
    csv_file_id: int,
    db: Session = Depends(get_db)
) -> BestPromptsResponse:
    """Get the best-performing prompt version for human annotations, each judge config, and each function eval config"""
    # Verify CSV file exists
    get_or_404(db, CSVFile, csv_file_id, "CSV file not found")
    
    # Initialize response dictionaries
    human_annotation_best: Optional[BestPromptInfo] = None
    judge_configs_best: Dict[int, Optional[BestPromptInfo]] = {}
    function_eval_configs_best: Dict[int, Optional[BestPromptInfo]] = {}
    
    # Calculate best prompt for human annotations
    prompt_annotation_scores = db.query(
        Evaluation.prompt_id,
        func.avg(cast(Evaluation.annotation, Float)).label('avg_score'),
        func.count(Evaluation.id).label('result_count')
    ).filter(
        and_(
            Evaluation.csv_file_id == csv_file_id,
            Evaluation.annotation.isnot(None)  # Only count evaluations with annotations
        )
    ).group_by(Evaluation.prompt_id).all()
    
    human_annotation_best = _find_best_prompt(db, prompt_annotation_scores)
    
    # Get all judge configs for this CSV file
    judge_configs = db.query(JudgeConfig).filter(
        JudgeConfig.csv_file_id == csv_file_id
    ).all()
    
    # For each judge config, find the best prompt
    for config in judge_configs:
        prompt_scores = db.query(
            JudgeResult.prompt_id,
            func.avg(JudgeResult.score).label('avg_score'),
            func.count(JudgeResult.id).label('result_count')
        ).filter(
            and_(
                JudgeResult.config_id == config.id,
                JudgeResult.csv_file_id == csv_file_id
            )
        ).group_by(JudgeResult.prompt_id).all()
        
        judge_configs_best[config.id] = _find_best_prompt(db, prompt_scores)
    
    # Get all function eval configs for this CSV file
    function_eval_configs = db.query(FunctionEvalConfig).filter(
        FunctionEvalConfig.csv_file_id == csv_file_id
    ).all()
    
    # For each function eval config, find the best prompt
    for config in function_eval_configs:
        prompt_scores = db.query(
            FunctionEvalResult.prompt_id,
            func.avg(FunctionEvalResult.score).label('avg_score'),
            func.count(FunctionEvalResult.id).label('result_count')
        ).filter(
            and_(
                FunctionEvalResult.config_id == config.id,
                FunctionEvalResult.csv_file_id == csv_file_id
            )
        ).group_by(FunctionEvalResult.prompt_id).all()
        
        function_eval_configs_best[config.id] = _find_best_prompt(db, prompt_scores)
    
    return BestPromptsResponse(
        human_annotation=human_annotation_best,
        judge_configs=judge_configs_best,
        function_eval_configs=function_eval_configs_best
    )
