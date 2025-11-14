"""Metric/Threshold model"""
from sqlalchemy import Column, Integer, Float, ForeignKey, DateTime, String, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base


class Metric(Base):
    """Model for storing evaluation thresholds/metrics per CSV file"""
    __tablename__ = "metrics"
    
    id = Column(Integer, primary_key=True, index=True)
    csv_file_id = Column(Integer, ForeignKey("csv_files.id", ondelete="CASCADE"), nullable=False)
    metric_type = Column(String, nullable=False)  # 'human_annotation', 'judge', 'function_eval'
    config_id = Column(Integer, nullable=True)  # For judge/function_eval metrics, the config ID. Null for human_annotation
    threshold = Column(Float, nullable=False)  # The threshold value
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    
    # Unique constraint: one metric per type/config per CSV file
    __table_args__ = (
        UniqueConstraint('csv_file_id', 'metric_type', 'config_id', name='uq_metric_csv_type_config'),
    )
    
    csv_file = relationship("CSVFile", back_populates="metrics")

