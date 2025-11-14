"""Function evaluation models"""
from sqlalchemy import Column, Integer, String, Text, Float, ForeignKey, DateTime, UniqueConstraint, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base


class FunctionEvalConfig(Base):
    """Model for storing function-based evaluation configurations"""
    __tablename__ = "function_eval_configs"
    
    id = Column(Integer, primary_key=True, index=True)
    csv_file_id = Column(Integer, ForeignKey("csv_files.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)  # Unique per CSV file, used as column name
    function_name = Column(String, nullable=False)  # Plugin name from evaluations registry
    config = Column(JSON, nullable=True)  # Optional per-eval config (JSON dict)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    
    # Unique constraint: name must be unique per CSV file
    __table_args__ = (
        UniqueConstraint('csv_file_id', 'name', name='uq_function_eval_config_csv_name'),
    )
    
    csv_file = relationship("CSVFile", back_populates="function_eval_configs")
    results = relationship("FunctionEvalResult", back_populates="config", cascade="all, delete-orphan")


class FunctionEvalResult(Base):
    """Model for storing function-based evaluation results (scores per row)"""
    __tablename__ = "function_eval_results"
    
    id = Column(Integer, primary_key=True, index=True)
    config_id = Column(Integer, ForeignKey("function_eval_configs.id", ondelete="CASCADE"), nullable=False)
    csv_file_id = Column(Integer, ForeignKey("csv_files.id", ondelete="CASCADE"), nullable=False)
    csv_row_id = Column(Integer, ForeignKey("csv_rows.id", ondelete="CASCADE"), nullable=False)
    score = Column(Float, nullable=False)  # Score from function evaluation
    details = Column(JSON, nullable=True)  # Optional details/metadata from evaluation
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    
    # Unique constraint: one result per config per row
    __table_args__ = (
        UniqueConstraint('config_id', 'csv_row_id', name='uq_function_eval_result_config_row'),
    )
    
    config = relationship("FunctionEvalConfig", back_populates="results")
    csv_file = relationship("CSVFile", back_populates="function_eval_results")
    csv_row = relationship("CSVRow", back_populates="function_eval_results")

