# Jarvis en el teléfono (sin laptop)

## La verdad rápida

| Quieres... | ¿Se puede sin laptop encendida? |
|---|---|
| Charlar / voz / consejos con Jarvis en el cel | **Sí** |
| Controlar apps, WhatsApp, cerrar Chrome, etc. en la PC | **No** (la PC tiene que estar ON con Jarvis) |

Controlar Windows **siempre** necesita un proceso en la laptop. No hay magia: el teléfono no puede abrir Cursor en una PC apagada.

---

## Opción A — Jarvis móvil solo (recomendado para “sin laptop”)

Usa la web en `docs/` (GitHub Pages, con HTTPS → el micrófono sí funciona).

### Activar GitHub Pages
1. Sube estos cambios al repo
2. En GitHub → **Settings → Pages**
3. Source: **Deploy from a branch**
4. Branch: `master` / folder: `/docs`
5. Espera 1-2 min y abre:
   `https://dannym2407-droid.github.io/Jarvis/`

### En el teléfono
1. Abre esa URL
2. Toca ⚙
3. Pega tu **Groq API Key** gratis ([console.groq.com/keys](https://console.groq.com/keys))
4. Habla o escribe

Eso vive solo en tu teléfono. La laptop puede estar apagada.

---

## Opción B — Controlar la PC desde el cel

Aquí la laptop **sí** debe estar encendida, pero tú no tienes que abrir el proyecto a mano:

1. En la PC: `npm run install-startup` (ya arranca con Windows)
2. Misma WiFi → `http://IP-DE-TU-PC:8787/phone.html`
3. O Telegram bot (token en `.env`) para mandar órdenes desde cualquier red

---

## Resumen
- **Cel solo, laptop apagada** → Opción A (GitHub Pages)
- **Cel controla la PC** → Opción B (PC encendida + Jarvis en Startup)
