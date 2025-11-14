"""GEPA Optimizer models"""
from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base


class GepaConfig(Base):
    """Configuration for a GEPA optimizer"""
    __tablename__ = "gepa_configs"
    
    id = Column(Integer, primary_key=True, index=True)
    csv_file_id = Column(Integer, ForeignKey("csv_files.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    
    # Base prompt to optimize (required)
    base_prompt_id = Column(Integer, ForeignKey("prompts.id", ondelete="SET NULL"), nullable=False)
    
    # Evaluation configs (stored as JSON arrays of IDs)
    judge_config_ids = Column(JSON, nullable=True)  # List of judge config IDs
    function_eval_config_ids = Column(JSON, nullable=True)  # List of function eval config IDs
    
    # GEPA LLM settings
    reflection_model = Column(String, nullable=False, default="gpt-5")  # Model for reflection/meta-prompt
    generator_model = Column(String, nullable=False, default="gpt-5")  # Model for generating outputs
    
    # Optimization budget
    max_metric_calls = Column(Integer, nullable=False, default=10)  # Max number of evaluations
    
    # Optional custom meta-prompt (if None, use default)
    custom_meta_prompt = Column(Text, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    csv_file = relationship("CSVFile", back_populates="gepa_configs")
    base_prompt = relationship("Prompt", foreign_keys=[base_prompt_id])

