@echo off
REM Starts backend (FastAPI) and frontend (Vite) each in their own window.
cd /d "%~dp0"

start "CSCMS backend" cmd /k backend\.venv\Scripts\python.exe backend\run.py
start "CSCMS frontend" cmd /k npx pnpm dev
