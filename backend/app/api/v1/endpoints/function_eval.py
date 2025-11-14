"""Endpoints for function-based evaluations."""

from fastapi import APIRouter, HTTPException
from typing import List

from app.services.function_eval_service import (
    list_function_evaluations,
    run_function_evaluation
)
from app.schemas.function_eval import (
    FunctionEvaluationInfo,
    RunFunctionEvaluationRequest,
    FunctionEvaluationResult
)

router = APIRouter()


@router.get("/", response_model=List[FunctionEvaluationInfo])
async def list_function_evaluations_endpoint() -> List[FunctionEvaluationInfo]:
    """
    List all available function-based evaluation plugins.
    
    Returns:
        List of available evaluation plugins with their names and descriptions
    """
    try:
        evaluations = list_function_evaluations()
        return [
            FunctionEvaluationInfo(**eval_info)
            for eval_info in evaluations
        ]
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list function evaluations: {str(e)}"
        )


@router.post("/run", response_model=FunctionEvaluationResult)
async def run_function_evaluation_endpoint(
    request: RunFunctionEvaluationRequest
) -> FunctionEvaluationResult:
    """
    Run a function-based evaluation on a row and output.
    
    Args:
        request: Request containing evaluation name, row data, output, and optional config
        
    Returns:
        Evaluation result with score and optional details
        
    Raises:
        HTTPException: If the evaluation is not found or fails to run
    """
    try:
        result = run_function_evaluation(
            name=request.evaluation_name,
            row=request.row,
            output=request.output,
            config=request.config
        )
        return FunctionEvaluationResult(**result)
    except KeyError as e:
        raise HTTPException(
            status_code=404,
            detail=str(e)
        )
    except RuntimeError as e:
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Unexpected error running function evaluation: {str(e)}"
        )



