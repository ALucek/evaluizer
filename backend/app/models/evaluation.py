from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base


class Evaluation(Base):
    """Model for storing evaluation-related data (output, annotation, feedback)"""
    __tablename__ = "evaluations"
    
    id = Column(Integer, primary_key=True, index=True)
    csv_file_id = Column(Integer, ForeignKey("csv_files.id", ondelete="CASCADE"), nullable=False)
    csv_row_id = Column(Integer, ForeignKey("csv_rows.id", ondelete="CASCADE"), nullable=False, unique=True)
    output = Column(Text, nullable=True)  # Generated output text
    annotation = Column(Integer, nullable=True)  # 1 for thumbs up, 0 for thumbs down, None for null
    feedback = Column(Text, nullable=True)  # User feedback text
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    csv_file = relationship("CSVFile", back_populates="evaluations")
    csv_row = relationship("CSVRow", back_populates="evaluation")

