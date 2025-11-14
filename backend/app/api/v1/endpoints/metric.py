from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional

from app.database import get_db
from app.models.metric import Metric
from app.models.csv_data import CSVFile
from app.utils import get_or_404
from app.schemas.metric import MetricResponse, CreateMetricRequest, UpdateMetricRequest

router = APIRouter()


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

