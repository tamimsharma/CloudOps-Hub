@echo off
setlocal
cd /d "%~dp0"

set "OPEN_URL=http://localhost:4000"

echo.
echo  ============================================
echo   CloudOps Hub - start with Docker
echo  ============================================
echo.

docker version >nul 2>&1
if errorlevel 1 (
  echo  [ERROR] Docker is not running.
  echo.
  echo  Install Docker Desktop from https://www.docker.com/products/docker-desktop/
  echo  start it, then double-click this file again.
  echo.
  pause
  exit /b 1
)

echo  Building and starting the platform (first run takes a few minutes)...
docker compose --profile app up --build -d
if not errorlevel 1 goto ready

echo.
echo  Port 4000 seems to be in use (npm run dev?) - trying port 8080 instead...
set "APP_PORT=8080"
set "APP_URL=http://localhost:8080"
set "OPEN_URL=http://localhost:8080"
docker compose --profile app up --build -d
if not errorlevel 1 goto ready

echo.
echo  [ERROR] "docker compose" failed - see the message above.
echo          Ports 4000 and 8080 are both busy, or Docker needs more resources.
pause
exit /b 1

:ready
echo  Waiting for the app to become ready
set /a tries=0

:wait
set /a tries+=1
curl.exe -s -o NUL -f %OPEN_URL%/health >nul 2>&1
if not errorlevel 1 goto opened
if %tries% geq 40 goto starting
echo  .
ping -n 4 127.0.0.1 >nul
goto wait

:opened
echo.
echo  --------------------------------------------
echo   CloudOps Hub is running
echo     Website:  %OPEN_URL%
echo     Stop it:  docker compose --profile app down
echo  --------------------------------------------
echo.
call :openurl "%OPEN_URL%"
goto end

:starting
echo.
echo  The container is still starting. Open %OPEN_URL% in a moment,
echo  or inspect it with:  docker compose --profile app logs
echo.

:end
pause
exit /b 0

:openurl
start "" %1 >nul 2>&1
if not errorlevel 1 exit /b 0
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
  start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" %1
  exit /b 0
)
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
  start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" %1
  exit /b 0
)
echo  Could not auto-open a browser - visit %~1 manually.
exit /b 0
