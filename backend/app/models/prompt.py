from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base


class Prompt(Base):
    """Model for storing saved prompts as part of the workflow"""
    __tablename__ = "prompts"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=True)  # Optional name for the prompt
    content = Column(Text, nullable=False)  # The prompt template with {{variable}} syntax
    csv_file_id = Column(Integer, ForeignKey("csv_files.id"), nullable=True)  # Optional link to specific CSV file
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    csv_file = relationship("CSVFile", foreign_keys=[csv_file_id])

