@echo off
cd /d "%~dp0"
title Jarvis
if not exist ".env" (
  echo Copia .env.example a .env y agrega tu GROQ_API_KEY gratis.
)
node server.js --greet
pause
