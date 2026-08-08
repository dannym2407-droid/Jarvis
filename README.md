# Jarvis

Asistente de voz local para Windows. Saluda al iniciar, escucha instrucciones y controla tu laptop. Usa voz del sistema + Groq (gratis).

## Estructura

```
Jarvis/
├── server.js              # Servidor local
├── start-app.bat          # App de escritorio (recomendado)
├── start.bat              # Modo navegador
├── package.json
├── .env.example
├── electron/              # Ventana de escritorio + bandeja
├── public/                # Panel (orbe + radar + mic)
├── src/
│   ├── ai.js              # Cerebro Groq
│   ├── config.js
│   ├── actions/           # Control del sistema
│   ├── core/              # Saludo + orquestación
│   └── voice/             # TTS (Edge Neural / Windows)
└── scripts/
    ├── greet-once.js
    ├── install-startup.ps1
    └── uninstall-startup.ps1
```

## Setup (gratis)

1. Copia `.env.example` a `.env`
2. Crea una API key gratis en [console.groq.com/keys](https://console.groq.com/keys)
3. Pégala en `.env` como `GROQ_API_KEY=...`
4. `npm install`
5. Doble clic en **`start-app.bat`** (app de escritorio)  
   o `start.bat` / `npm start` → `http://127.0.0.1:8787`

## Arranque al prender la PC

```powershell
npm run install-startup
```

Eso crea un acceso directo en la carpeta Startup de Windows. Para quitarlo:

```powershell
npm run uninstall-startup
```

## Qué puede hacer

- Saludarte con voz al iniciar
- Abrir apps (Chrome, WhatsApp, Cursor, VS Code, Terminal, etc.)
- Buscar en la web
- Subir/bajar volumen, silenciar
- Bloquear sesión, captura de pantalla
- Decirte la hora/fecha
- Entender órdenes naturales con Groq
- Seguir escuchando / hablarte aunque estés en otra ventana (`Ctrl+Shift+J`)

## Ejemplos

- "Abre WhatsApp"
- "Abre Visual" / "Abre VS Code"
- "Qué hora es"
- "Busca clima en Guatemala"
- "Sube el volumen"
- "Haz una captura"
- "Bloquea la PC"

## Voz

Por defecto usa **es-MX-DaliaNeural** (clara). En `.env` puedes cambiarla:

```
VOICE_NAME=es-MX-DaliaNeural
# VOICE_NAME=es-MX-JorgeNeural
# VOICE_NAME=es-ES-ElviraNeural
```

## Notas

- App de escritorio: `start-app.bat` / `npm run app`
- Micrófono: en la app usa Whisper (Groq); en Chrome/Edge puede usar Web Speech
- Todo corre en local; con `HOST=0.0.0.0` puedes usar el panel desde el teléfono en la misma WiFi
