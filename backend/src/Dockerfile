FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /src

# Install system dependencies
RUN apt-get update && apt-get install -y \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt /src/
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r /src/requirements.txt

# Copy application code (includes entrypoint scripts)
COPY ./src /src/

# Make entrypoint scripts executable
RUN chmod +x /src/entrypoint-dev.sh /src/entrypoint-prod.sh

# Entrypoint will be set in docker-compose.yml
