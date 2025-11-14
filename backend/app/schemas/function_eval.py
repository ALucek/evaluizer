"""Schemas for function-based evaluation endpoints."""

from pydantic import BaseModel, field_validator
from typing import Optional, Dict, Any
from datetime import datetime


class FunctionEvaluationInfo(BaseModel):
    """Information about an available function evaluation plugin."""
    name: str
    description: str


class RunFunctionEvaluationRequest(BaseModel):
    """Request to run a function evaluation (Phase 1 - direct plugin call)."""
    evaluation_name: str
    row: Dict[str, Any]
    output: Optional[str] = None
    config: Optional[Dict[str, Any]] = None
    
    @field_validator('evaluation_name')
    @classmethod
    def validate_evaluation_name(cls, v):
        if not v or not v.strip():
            raise ValueError('evaluation_name cannot be empty')
        return v.strip()


class FunctionEvaluationResult(BaseModel):
    """Result from running a function evaluation (Phase 1 - direct plugin call)."""
    score: float | int | bool
    details: Dict[str, Any] = {}


# Phase 2 schemas for persisted configs and results

class FunctionEvalConfigResponse(BaseModel):
    """Response model for function evaluation config."""
    id: int
    csv_file_id: int
    name: str
    function_name: str
    config: Optional[Dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class CreateFunctionEvalConfigRequest(BaseModel):
    """Request to create a function evaluation config."""
    csv_file_id: int
    name: str
    function_name: str
    config: Optional[Dict[str, Any]] = None
    
    @field_validator('name')
    @classmethod
    def validate_name(cls, v):
        if not v or not v.strip():
            raise ValueError('name cannot be empty')
        return v.strip()
    
    @field_validator('function_name')
    @classmethod
    def validate_function_name(cls, v):
        if not v or not v.strip():
            raise ValueError('function_name cannot be empty')
        return v.strip()


class UpdateFunctionEvalConfigRequest(BaseModel):
    """Request to update a function evaluation config."""
    name: Optional[str] = None
    config: Optional[Dict[str, Any]] = None
    
    @field_validator('name')
    @classmethod
    def validate_name(cls, v):
        if v is not None and (not v or not v.strip()):
            raise ValueError('name cannot be empty')
        return v.strip() if v else None


class FunctionEvalResultResponse(BaseModel):
    """Response model for function evaluation result."""
    id: int
    config_id: int
    csv_file_id: int
    csv_row_id: int
    score: float
    details: Optional[Dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class RunFunctionEvalRequest(BaseModel):
    """Request to run a function evaluation (Phase 2 - via config)."""
    config_id: int
    csv_row_id: int

