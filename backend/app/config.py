"""Configuration settings"""
import os
from typing import List

# Database configuration
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./evaluizer.db")

# Application settings
API_V1_PREFIX = "/api/v1"

# CORS configuration
CORS_ORIGINS: List[str] = [
    "http://localhost:3000",
    "http://localhost:5173",
]

# Allow additional origins from environment variable (comma-separated)
_extra_origins = os.getenv("CORS_ORIGINS", "")
if _extra_origins:
    CORS_ORIGINS.extend([origin.strip() for origin in _extra_origins.split(",") if origin.strip()])
