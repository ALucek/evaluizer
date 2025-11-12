"""FastAPI application entry point"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1 import api_router
from app.config import API_V1_PREFIX, CORS_ORIGINS
from app.database import engine, Base

# Import all models to ensure they're registered with SQLAlchemy
from app.models import CSVFile, CSVRow, Evaluation, Prompt  # noqa: F401

# Create database tables (only creates if they don't exist)
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Evaluizer API", version="1.0.0")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=API_V1_PREFIX)


@app.get("/")
async def root() -> dict[str, str]:
    """Root endpoint"""
    return {"message": "Evaluizer API"}
