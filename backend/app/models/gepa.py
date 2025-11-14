"""GEPA Optimizer models"""
from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, JSON, Float
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
    generator_model = Column(String, nullable=False, default="gpt-5")  # Model for generating outputs (the model you're optimizing for)
    reflection_model = Column(String, nullable=False, default="gpt-5")  # Model for reflection/meta-prompt (can be different, often more powerful)
    generator_temperature = Column(Float, nullable=False, default=1.0)  # Temperature for generator model calls
    generator_max_tokens = Column(Integer, nullable=False, default=16384)  # Max tokens for generator model completions
    reflection_temperature = Column(Float, nullable=False, default=1.0)  # Temperature for reflection model calls
    reflection_max_tokens = Column(Integer, nullable=False, default=16384)  # Max tokens for reflection model completions
    
    # Optimization budget
    max_metric_calls = Column(Integer, nullable=False, default=10)  # Max number of evaluations
    
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    
    csv_file = relationship("CSVFile", back_populates="gepa_configs")
    base_prompt = relationship("Prompt", foreign_keys=[base_prompt_id])

