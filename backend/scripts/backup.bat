@echo off
REM Database Backup Script (Windows)
REM Run: backend\scripts\backup.bat
REM Schedule with Task Scheduler for automated backups.

cd /d "%~dp0\.."
node scripts\backup.js

if %ERRORLEVEL% NEQ 0 (
    echo [backup] Backup failed with exit code %ERRORLEVEL%
    exit /b %ERRORLEVEL%
)
