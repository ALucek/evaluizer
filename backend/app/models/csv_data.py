"""CSV data models"""
from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base


class CSVFile(Base):
    """Model for storing original CSV file metadata"""
    __tablename__ = "csv_files"
    
    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, nullable=False)
    uploaded_at = Column(DateTime, default=datetime.utcnow)
    columns = Column(Text, nullable=False)  # JSON string of column names (original columns only)
    
    rows = relationship("CSVRow", back_populates="csv_file", cascade="all, delete-orphan")
    evaluations = relationship("Evaluation", back_populates="csv_file", cascade="all, delete-orphan")


class CSVRow(Base):
    """Model for storing individual CSV rows (original data only)"""
    __tablename__ = "csv_rows"
    
    id = Column(Integer, primary_key=True, index=True)
    csv_file_id = Column(Integer, ForeignKey("csv_files.id", ondelete="CASCADE"), nullable=False)
    row_data = Column(Text, nullable=False)  # JSON string of row data (original columns only)
    
    csv_file = relationship("CSVFile", back_populates="rows")
    evaluation = relationship("Evaluation", back_populates="csv_row", uselist=False, cascade="all, delete-orphan")
