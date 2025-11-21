# This Dockerfile expects the build context to be the project root
# docker build -f backend/Dockerfile .

FROM python:3.13-slim

WORKDIR /app

# Copy evaluations package
COPY evaluations/ /app/evaluations/
# Install evaluations package
RUN pip install --no-cache-dir /app/evaluations

# Copy backend package definition
COPY backend/pyproject.toml /app/backend/

# Set working directory to backend
WORKDIR /app/backend

# Install backend dependencies
RUN pip install --no-cache-dir .

# Create data directory for persistence
RUN mkdir -p data

# Copy backend source code
COPY backend/ /app/backend/

# Expose port
EXPOSE 8000

# Command to run the application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
