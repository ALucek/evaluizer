from pydantic import BaseModel, field_validator
from datetime import datetime
from typing import Optional


class EvaluationResponse(BaseModel):
    id: int
    csv_file_id: int
    csv_row_id: int
    output: Optional[str] = None
    annotation: Optional[int] = None  # 1 for thumbs up, 0 for thumbs down, None for null
    feedback: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class UpdateEvaluationRequest(BaseModel):
    output: Optional[str] = None
    annotation: Optional[int] = None  # 1 for thumbs up, 0 for thumbs down, None for null
    feedback: Optional[str] = None
    
    @field_validator('annotation')
    @classmethod
    def validate_annotation(cls, v):
        if v is not None and v not in [0, 1]:
            raise ValueError('annotation must be 0, 1, or None')
        return v


class CreateEvaluationRequest(BaseModel):
    csv_row_id: int
    output: Optional[str] = None
    annotation: Optional[int] = None
    feedback: Optional[str] = None
    
    @field_validator('annotation')
    @classmethod
    def validate_annotation(cls, v):
        if v is not None and v not in [0, 1]:
            raise ValueError('annotation must be 0, 1, or None')
        return v

