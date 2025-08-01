#!/usr/bin/bash
set -e
# Activate the virtual environment
source /venv/.venv/bin/activate
# Run the database migrations
aerich upgrade
# Create the index for the document search
python -m app.manage index
# Run the FastAPI application with Uvicorn
uvicorn \
    --host 0.0.0.0 \
    --port 8080 \
    --workers 3 \
    --access-log \
    --proxy-headers \
    --forwarded-allow-ips "172.18.0.0/16" \
    app.main:app
