# Use Python 3.11 slim base image
FROM python:3.11-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive

# Set work directory
WORKDIR /app

# Install system dependencies needed for compiling psycopg2, cryptography, etc.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        gcc \
        libpq-dev \
        curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements file first for layer caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

# Ensure storage directories exist
RUN mkdir -p uploads static logs

# Expose backend port
EXPOSE 8011

# Health check endpoint
HEALTHCHECK --interval=20s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8011/health || exit 1

# Default command for local development with live auto-reloading
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8011", "--reload"]
