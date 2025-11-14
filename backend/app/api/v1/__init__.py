# API v1
from fastapi import APIRouter
from app.api.v1.endpoints import csv, evaluation, prompt, llm, judge, function_eval, function_eval_config, metric, gepa

api_router = APIRouter()
api_router.include_router(csv.router, prefix="/csv", tags=["csv"])
api_router.include_router(evaluation.router, prefix="/evaluation", tags=["evaluation"])
api_router.include_router(prompt.router, prefix="/prompt", tags=["prompt"])
api_router.include_router(llm.router, prefix="/llm", tags=["llm"])
api_router.include_router(judge.router, prefix="/judge", tags=["judge"])
api_router.include_router(function_eval.router, prefix="/function-evaluations", tags=["function-evaluations"])
api_router.include_router(function_eval_config.router, prefix="/function-eval", tags=["function-eval"])
api_router.include_router(metric.router, prefix="", tags=["metric"])
api_router.include_router(gepa.router, prefix="/optimizer/gepa", tags=["gepa"])
