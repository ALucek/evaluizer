from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class PromptResponse(BaseModel):
    id: int
    name: Optional[str] = None
    system_prompt: str
    user_message_column: Optional[str] = None
    csv_file_id: Optional[int] = None
    version: int
    commit_message: Optional[str] = None
    parent_prompt_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class CreatePromptRequest(BaseModel):
    name: Optional[str] = None
    system_prompt: str
    user_message_column: Optional[str] = None
    csv_file_id: Optional[int] = None
    commit_message: Optional[str] = None
    parent_prompt_id: Optional[int] = None  # If provided, creates a new version


class UpdatePromptRequest(BaseModel):
    name: Optional[str] = None
    system_prompt: Optional[str] = None
    user_message_column: Optional[str] = None
    csv_file_id: Optional[int] = None
    commit_message: Optional[str] = None


class CreateVersionRequest(BaseModel):
    system_prompt: str
    user_message_column: Optional[str] = None
    name: Optional[str] = None
    commit_message: Optional[str] = None

