@echo off
title Juan's Brain - Setup
echo ============================================
echo   JUAN'S BRAIN - one-time setup
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [!] Node.js is not installed.
  echo     Download the LTS from https://nodejs.org and run this again.
  pause
  exit /b 1
)

echo [1/3] Installing Claude Code...
call npm install -g @anthropic-ai/claude-code
if errorlevel 1 ( echo [!] npm install failed & pause & exit /b 1 )

echo [2/3] Getting the brain (cloning repo)...
if not exist "%USERPROFILE%\JuanBrain" (
  git clone https://github.com/juantwinhomes/Juan-Diaz-CEO-Twin-Home-Buyer.git "%USERPROFILE%\JuanBrain"
) else (
  echo     Brain already exists at %USERPROFILE%\JuanBrain - updating...
  cd /d "%USERPROFILE%\JuanBrain" && git pull
)

echo [3/3] Starting the Twin...
cd /d "%USERPROFILE%\JuanBrain"
echo.
echo  Sign in when asked. From then on: open this folder, type "claude".
echo ============================================
claude
