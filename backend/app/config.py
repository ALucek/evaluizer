# Configuration settings
import os
from pathlib import Path

# Database configuration
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./evaluizer.db")

# Application settings
API_V1_PREFIX = "/api/v1"
