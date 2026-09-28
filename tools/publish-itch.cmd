@echo off
rem Double-click wrapper for publish-itch.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0publish-itch.ps1" %*
pause
