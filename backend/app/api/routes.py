# Main API routes
from fastapi import APIRouter
from app.api.v1 import api_router as v1_router
from app.config import API_V1_PREFIX

api_router = APIRouter()
api_router.include_router(v1_router, prefix=API_V1_PREFIX)
