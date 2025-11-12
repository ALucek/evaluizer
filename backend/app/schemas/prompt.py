from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class PromptResponse(BaseModel):
    id: int
    name: Optional[str] = None
    content: str
    csv_file_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class CreatePromptRequest(BaseModel):
    name: Optional[str] = None
    content: str
    csv_file_id: Optional[int] = None


class UpdatePromptRequest(BaseModel):
    name: Optional[str] = None
    content: Optional[str] = None
    csv_file_id: Optional[int] = None

