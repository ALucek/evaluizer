"""GEPA Optimizer schemas"""
from pydantic import BaseModel, field_validator
from datetime import datetime
from typing import Optional, List


class GepaConfigResponse(BaseModel):
    """GEPA config response"""
    id: int
    csv_file_id: int
    name: str
    base_prompt_id: int  # Required
    judge_config_ids: Optional[List[int]] = None
    function_eval_config_ids: Optional[List[int]] = None
    generator_model: str  # Model for generating outputs (the model you're optimizing for)
    reflection_model: str  # Model for reflection/meta-prompt
    generator_temperature: float
    generator_max_tokens: int
    reflection_temperature: float
    reflection_max_tokens: int
    max_metric_calls: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class CreateGepaConfigRequest(BaseModel):
    """Request to create a GEPA config"""
    csv_file_id: int
    name: str
    base_prompt_id: int  # Required - must have a prompt to optimize
    judge_config_ids: Optional[List[int]] = None
    function_eval_config_ids: Optional[List[int]] = None
    generator_model: str = "gpt-5"  # Model for generating outputs (the model you're optimizing for)
    reflection_model: Optional[str] = None  # Model for reflection/meta-prompt (defaults to generator_model if not specified)
    generator_temperature: float = 1.0
    generator_max_tokens: int = 16384
    reflection_temperature: float = 1.0
    reflection_max_tokens: int = 16384
    max_metric_calls: int = 10
    
    @field_validator('name')
    @classmethod
    def validate_name(cls, v):
        if not v or not v.strip():
            raise ValueError('name cannot be empty')
        return v.strip()
    
    @field_validator('max_metric_calls')
    @classmethod
    def validate_max_metric_calls(cls, v):
        if v < 1:
            raise ValueError('max_metric_calls must be at least 1')
        return v


class UpdateGepaConfigRequest(BaseModel):
    """Request to update a GEPA config"""
    name: Optional[str] = None
    base_prompt_id: Optional[int] = None  # Can update to a different prompt
    judge_config_ids: Optional[List[int]] = None
    function_eval_config_ids: Optional[List[int]] = None
    generator_model: Optional[str] = None  # Model for generating outputs
    reflection_model: Optional[str] = None  # Model for reflection/meta-prompt
    generator_temperature: Optional[float] = None
    generator_max_tokens: Optional[int] = None
    reflection_temperature: Optional[float] = None
    reflection_max_tokens: Optional[int] = None
    max_metric_calls: Optional[int] = None
    
    @field_validator('name')
    @classmethod
    def validate_name(cls, v):
        if v is not None and (not v or not v.strip()):
            raise ValueError('name cannot be empty')
        return v.strip() if v else None
    
    @field_validator('max_metric_calls')
    @classmethod
    def validate_max_metric_calls(cls, v):
        if v is not None and v < 1:
            raise ValueError('max_metric_calls must be at least 1')
        return v


class RunGepaResponse(BaseModel):
    """Response from running GEPA optimization"""
    best_prompt: str
    new_prompt_id: int
    score: float
    logs: Optional[str] = None

