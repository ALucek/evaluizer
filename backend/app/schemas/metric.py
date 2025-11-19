from pydantic import BaseModel, field_validator
from datetime import datetime
from typing import Optional, Dict


class MetricResponse(BaseModel):
    id: int
    csv_file_id: int
    metric_type: str  # 'human_annotation', 'judge', 'function_eval'
    config_id: Optional[int] = None
    threshold: float
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class CreateMetricRequest(BaseModel):
    csv_file_id: int
    metric_type: str
    config_id: Optional[int] = None
    threshold: float
    
    @field_validator('metric_type')
    @classmethod
    def validate_metric_type(cls, v):
        allowed_types = ['human_annotation', 'judge', 'function_eval']
        if v not in allowed_types:
            raise ValueError(f'metric_type must be one of {allowed_types}')
        return v
    
    @field_validator('threshold')
    @classmethod
    def validate_threshold(cls, v):
        if not isinstance(v, (int, float)):
            raise ValueError('threshold must be a number')
        return float(v)


class UpdateMetricRequest(BaseModel):
    threshold: float
    
    @field_validator('threshold')
    @classmethod
    def validate_threshold(cls, v):
        if not isinstance(v, (int, float)):
            raise ValueError('threshold must be a number')
        return float(v)


class BestPromptInfo(BaseModel):
    id: int
    name: Optional[str]
    version: int
    average_score: float
    result_count: int


class BestPromptsResponse(BaseModel):
    human_annotation: Optional[BestPromptInfo] = None
    judge_configs: Dict[int, Optional[BestPromptInfo]]
    function_eval_configs: Dict[int, Optional[BestPromptInfo]]

