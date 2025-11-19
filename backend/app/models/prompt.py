from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, Float
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base


class Prompt(Base):
    """Model for storing saved prompts as part of the workflow"""
    __tablename__ = "prompts"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=True)  # Prompt name (like git branch name)
    system_prompt = Column(Text, nullable=False)  # System prompt template (can include {{variable}} syntax for columns)
    user_message_column = Column(String, nullable=True)  # Column name that contains the user message for each row
    csv_file_id = Column(Integer, ForeignKey("csv_files.id", ondelete="CASCADE"), nullable=True)  # Optional link to specific CSV file
    version = Column(Integer, default=1)  # Version number for this prompt
    commit_message = Column(Text, nullable=True)  # Update message (like git commit message)
    parent_prompt_id = Column(Integer, ForeignKey("prompts.id", ondelete="SET NULL"), nullable=True)  # Reference to parent prompt (for versioning)
    
    # LLM Configuration (saved with each prompt version)
    model = Column(String, nullable=True)  # e.g., "gpt-4", "claude-3-5-sonnet-20241022"
    temperature = Column(Float, nullable=True)  # 0.0 to 1.0
    max_tokens = Column(Integer, nullable=True)  # Maximum tokens for response
    concurrency = Column(Integer, nullable=True)  # Number of concurrent requests
    
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    
    csv_file = relationship("CSVFile", foreign_keys=[csv_file_id])
    parent_prompt = relationship("Prompt", remote_side=[id], backref="versions")

