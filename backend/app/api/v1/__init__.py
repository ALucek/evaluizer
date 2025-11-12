# API v1
from fastapi import APIRouter
from app.api.v1.endpoints import csv, evaluation, prompt, llm

api_router = APIRouter()
api_router.include_router(csv.router, prefix="/csv", tags=["csv"])
api_router.include_router(evaluation.router, prefix="/evaluation", tags=["evaluation"])
api_router.include_router(prompt.router, prefix="/prompt", tags=["prompt"])
api_router.include_router(llm.router, prefix="/llm", tags=["llm"])
