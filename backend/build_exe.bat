@echo off
REM PLAN 10.2: builds the packaged backend exe (backend\dist\cscms-backend\).
REM Requires: .venv\Scripts\pip.exe install pyinstaller
cd /d "%~dp0"
.venv\Scripts\pyinstaller.exe --name cscms-backend --onedir --noconfirm --add-data "migrations;migrations" run.py
