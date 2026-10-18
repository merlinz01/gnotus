#!/usr/bin/bash
set -e
# Activate the virtual environment
source /venv/.venv/bin/activate
# Run the database migrations
aerich upgrade
# Create the index for the document search
python -m app.manage index || echo "Indexing failed; run 'python -m app.manage index' to retry."
# Run the FastAPI development server, which reloads on changes
exec fastapi dev \
    --host 0.0.0.0 \
    --port 8000 \
    --reload
