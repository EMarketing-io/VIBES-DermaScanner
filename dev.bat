@echo off
setlocal

echo.
echo ╔══════════════════════════════════════╗
echo ║       Vibes DermaScan — Dev          ║
echo ╚══════════════════════════════════════╝
echo.

set ROOT=%~dp0
set BACKEND=%ROOT%backend
set FRONTEND=%ROOT%frontend

:: Check for .env
if not exist "%BACKEND%\.env" (
    echo [WARN] No backend\.env found. Copying from .env.example...
    copy "%BACKEND%\.env.example" "%BACKEND%\.env" >nul
    echo        Edit backend\.env and add your OPENAI_API_KEY, then re-run.
    echo.
)

echo [1/3] Installing backend dependencies...
cd /d "%BACKEND%"
pip install -r requirements.txt -q

echo [2/3] Installing frontend dependencies...
cd /d "%FRONTEND%"
npm install --silent

echo [3/3] Starting servers...
echo.
echo   Backend  ^=^> http://localhost:8000
echo   Frontend ^=^> http://localhost:3000
echo.

:: Open two terminal windows
start "Vibes Backend" cmd /k "cd /d "%BACKEND%" && uvicorn main:app --reload --port 8000"
timeout /t 2 /nobreak >nul
start "Vibes Frontend" cmd /k "cd /d "%FRONTEND%" && npm run dev"

echo Both servers starting in separate windows.
echo Press any key to exit this launcher.
pause >nul
