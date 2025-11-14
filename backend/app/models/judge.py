"""Judge evaluation models"""
from sqlalchemy import Column, Integer, String, Text, Float, ForeignKey, DateTime, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base


class JudgeConfig(Base):
    """Model for storing LLM-as-a-judge evaluation configurations"""
    __tablename__ = "judge_configs"
    
    id = Column(Integer, primary_key=True, index=True)
    csv_file_id = Column(Integer, ForeignKey("csv_files.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)  # Unique per CSV file, used as column name
    prompt = Column(Text, nullable=False)  # Core judge prompt (will be wrapped with prefix/suffix)
    model = Column(String, nullable=False)  # LiteLLM model ID
    temperature = Column(Float, nullable=False, default=1.0)
    max_tokens = Column(Integer, nullable=False, default=2000)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    
    # Unique constraint: name must be unique per CSV file
    __table_args__ = (
        UniqueConstraint('csv_file_id', 'name', name='uq_judge_config_csv_name'),
    )
    
    csv_file = relationship("CSVFile", back_populates="judge_configs")
    results = relationship("JudgeResult", back_populates="config", cascade="all, delete-orphan")


class JudgeResult(Base):
    """Model for storing LLM-as-a-judge evaluation results (scores per row)"""
    __tablename__ = "judge_results"
    
    id = Column(Integer, primary_key=True, index=True)
    config_id = Column(Integer, ForeignKey("judge_configs.id", ondelete="CASCADE"), nullable=False)
    csv_file_id = Column(Integer, ForeignKey("csv_files.id", ondelete="CASCADE"), nullable=False)
    csv_row_id = Column(Integer, ForeignKey("csv_rows.id", ondelete="CASCADE"), nullable=False)
    score = Column(Float, nullable=False)  # Parsed score from <score>...</score>
    raw_output = Column(Text, nullable=True)  # Full LLM output text
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    
    # Unique constraint: one result per config per row
    __table_args__ = (
        UniqueConstraint('config_id', 'csv_row_id', name='uq_judge_result_config_row'),
    )
    
    config = relationship("JudgeConfig", back_populates="results")
    csv_file = relationship("CSVFile", back_populates="judge_results")
    csv_row = relationship("CSVRow", back_populates="judge_results")

