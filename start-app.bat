@echo off
cd /d "%~dp0"
title JARVIS App
if not exist ".env" (
  echo Copia .env.example a .env y agrega tu GROQ_API_KEY.
  pause
  exit /b 1
)
if not exist "node_modules\electron" (
  echo Instalando Electron...
  call npm install
)
echo Iniciando JARVIS como app...
call npm run app
