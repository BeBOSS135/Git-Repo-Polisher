@echo off
title GitHub Repo Polisher
cd /d "%~dp0"

REM --- Clean up any orphaned server still holding port 5173 from a previous run ---
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173" ^| findstr "LISTENING"') do (
  taskkill /F /PID %%a >nul 2>&1
)

REM --- Ensure Ollama is reachable (shared service; left running on exit) ---
curl -s http://localhost:11434/api/tags >nul 2>&1
if errorlevel 1 (
  echo Ollama not running - starting it...
  start "" /min ollama serve
  timeout /t 2 >nul
)

REM --- First run: install dependencies ---
if not exist "node_modules" (
  echo Installing dependencies, first run only...
  call npm install
)

REM --- Open the browser ~3s after launch, once the dev server is up ---
start "" /b cmd /c "ping -n 4 127.0.0.1 >nul & rundll32 url.dll,FileProtocolHandler http://localhost:5173/"

echo.
echo ==========================================================
echo  GitHub Repo Polisher  ->  http://localhost:5173
echo  CLOSE THIS WINDOW (or press Ctrl+C) to stop the server.
echo ==========================================================
echo.

REM --- Run Vite directly via node (no npm wrapper) so it's THIS window's
REM     foreground process. Closing the window terminates it instead of
REM     orphaning a grandchild process that keeps the site alive.
node "node_modules\vite\bin\vite.js"
