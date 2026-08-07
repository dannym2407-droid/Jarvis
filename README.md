# Jarvis

Asistente de voz local estilo Jarvis para Windows. Saluda al iniciar, escucha instrucciones y controla tu laptop. Sin compras: usa voz del sistema Windows + Groq gratis.

## Estructura

```
Jarvis/
├── server.js              # Servidor local (como Aditus)
├── start.bat              # Arranque rápido
├── package.json
├── .env.example
├── public/                # Panel web (chat + micrófono)
│   ├── index.html
│   ├── style.css
│   └── app.js
├── src/
│   ├── ai.js              # Cerebro Groq
│   ├── config.js
│   ├── actions/           # Control del sistema
│   ├── core/              # Saludo + orquestación
│   └── voice/             # TTS Windows
└── scripts/
    ├── greet-once.js
    ├── install-startup.ps1
    └── uninstall-startup.ps1
```

## Setup (gratis)

1. Copia `.env.example` a `.env`
2. Crea una API key gratis en [console.groq.com/keys](https://console.groq.com/keys)
3. Pégala en `.env` como `GROQ_API_KEY=...`
4. Doble clic en `start.bat` **o** `npm start`
5. Abre `http://127.0.0.1:8787`

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
- Abrir apps (Chrome, Edge, Spotify, Discord, Cursor, VS Code, etc.)
- Buscar en la web
- Subir/bajar volumen, silenciar
- Bloquear sesión, captura de pantalla
- Decirte la hora/fecha
- Entender órdenes naturales con Groq

## Ejemplos

- "Abre Chrome"
- "Qué hora es"
- "Busca clima en Guatemala"
- "Sube el volumen"
- "Haz una captura"
- "Bloquea la PC"

## Notas

- El micrófono usa la Web Speech API del navegador (Chrome/Edge).
- La voz de salida usa `System.Speech` de Windows (offline, gratis).
- Todo corre en `127.0.0.1`; no expone puertos a internet.
