#!/usr/bin/env bash
set -o errexit

python -m pip install --upgrade pip
python -m pip install -r backend/requirements.txt
python backend/manage.py collectstatic --no-input
python backend/manage.py migrate
python backend/create_superuser.py
