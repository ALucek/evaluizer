from pydantic import BaseModel, field_validator
from datetime import datetime
from typing import Optional


class JudgeConfigResponse(BaseModel):
    id: int
    csv_file_id: int
    name: str
    prompt: str
    model: str
    temperature: float
    max_tokens: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class CreateJudgeConfigRequest(BaseModel):
    csv_file_id: int
    name: str
    prompt: str
    model: str
    temperature: float = 1.0
    max_tokens: int = 2000
    
    @field_validator('name')
    @classmethod
    def validate_name(cls, v):
        if not v or not v.strip():
            raise ValueError('name cannot be empty')
        return v.strip()
    
    @field_validator('prompt')
    @classmethod
    def validate_prompt(cls, v):
        if not v or not v.strip():
            raise ValueError('prompt cannot be empty')
        return v.strip()
    
    @field_validator('temperature')
    @classmethod
    def validate_temperature(cls, v):
        if v < 0 or v > 1:
            raise ValueError('temperature must be between 0 and 1')
        return v
    
    @field_validator('max_tokens')
    @classmethod
    def validate_max_tokens(cls, v):
        if v < 1:
            raise ValueError('max_tokens must be at least 1')
        return v


class UpdateJudgeConfigRequest(BaseModel):
    name: Optional[str] = None
    prompt: Optional[str] = None
    model: Optional[str] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    
    @field_validator('name')
    @classmethod
    def validate_name(cls, v):
        if v is not None and (not v or not v.strip()):
            raise ValueError('name cannot be empty')
        return v.strip() if v else None
    
    @field_validator('prompt')
    @classmethod
    def validate_prompt(cls, v):
        if v is not None and (not v or not v.strip()):
            raise ValueError('prompt cannot be empty')
        return v.strip() if v else None
    
    @field_validator('temperature')
    @classmethod
    def validate_temperature(cls, v):
        if v is not None and (v < 0 or v > 1):
            raise ValueError('temperature must be between 0 and 1')
        return v
    
    @field_validator('max_tokens')
    @classmethod
    def validate_max_tokens(cls, v):
        if v is not None and v < 1:
            raise ValueError('max_tokens must be at least 1')
        return v


class JudgeResultResponse(BaseModel):
    id: int
    config_id: int
    csv_file_id: int
    csv_row_id: int
    score: float
    raw_output: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class JudgeRunRequest(BaseModel):
    config_id: int
    csv_row_id: int

