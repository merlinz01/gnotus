#!/usr/bin/bash
set -e
source /venv/.venv/bin/activate
python -m app.manage "$@"