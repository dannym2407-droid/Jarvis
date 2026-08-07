# Jarvis App (escritorio)

## Cómo abrirlo como app (no navegador)

1. Una vez: `npm install`
2. Doble clic en **`start-app.bat`**
   - o: `npm run app`

Se abre una ventana **JARVIS** (Electron) con bandeja del sistema.

### Atajos
- `Ctrl+Shift+J` → mostrar + toggle micrófono
- `Ctrl+Shift+H` → ocultar / mostrar
- Cerrar la ventana → queda en la bandeja (no se cierra del todo)
- Bandeja → Salir

### Arranque con Windows
```bat
npm run install-startup
```

## Modo clásico (navegador)
```bat
start.bat
```
o `npm start` → http://127.0.0.1:8787/

## Requisitos
- Node 18+
- `.env` con `GROQ_API_KEY`
- Micrófono permitido
