const actions = require("./system");

/**
 * Enrutador de acciones del asistente.
 */
async function runAction(action, args = {}) {
  switch (action) {
    case "open_app":
      return actions.openApp(args.name);
    case "open_url":
      return actions.openUrl(args.url);
    case "open_path":
      return actions.openPath(args.path);
    case "search_web":
      return actions.searchWeb(args.query);
    case "volume":
      return actions.setVolume(args);
    case "lock":
      return actions.lockPc();
    case "sleep":
      return actions.sleepPc();
    case "screenshot":
      return actions.screenshot();
    case "tell_time":
      return actions.tellTime();
    case "tell_date":
      return actions.tellDate();
    case "none":
    case undefined:
    case null:
      return { ok: true, message: "" };
    default:
      return { ok: false, message: `Acción desconocida: ${action}` };
  }
}

/**
 * Atajos locales sin IA (rápidos y offline).
 */
function matchLocalCommand(text) {
  const t = String(text || "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

  if (/^(hola|hey|buenas|que onda|qué onda)/.test(t)) {
    return { action: "none", args: {}, say: "¿Qué onda? Dime qué hago." };
  }
  if (/que hora|qué hora|hora es/.test(t)) {
    return { action: "tell_time", args: {}, say: null };
  }
  if (/que dia|qué día|que fecha|qué fecha/.test(t)) {
    return { action: "tell_date", args: {}, say: null };
  }
  if (/bloquea|lock/.test(t)) {
    return { action: "lock", args: {}, say: "Bloqueando." };
  }
  if (/captura|screenshot|pantallazo/.test(t)) {
    return { action: "screenshot", args: {}, say: "Capturando pantalla." };
  }
  if (/sube (el )?volumen|volumen arriba/.test(t)) {
    return { action: "volume", args: { delta: 10 }, say: "Subiendo volumen." };
  }
  if (/baja (el )?volumen|volumen abajo/.test(t)) {
    return { action: "volume", args: { delta: -10 }, say: "Bajando volumen." };
  }
  if (/mute|silencio|callate|cállate el volumen/.test(t)) {
    return { action: "volume", args: { mute: true }, say: "Silencio." };
  }

  const openMatch = t.match(/^(abre|abrir|abre el|abre la|open)\s+(.+)$/);
  if (openMatch) {
    const target = openMatch[2].trim();
    const appAliases = {
      chrome: "chrome",
      google: "chrome",
      navegador: "chrome",
      edge: "edge",
      notepad: "notepad",
      bloc: "notepad",
      "bloc de notas": "notepad",
      explorador: "explorer",
      archivos: "explorer",
      spotify: "spotify",
      discord: "discord",
      codigo: "vscode",
      código: "vscode",
      vscode: "vscode",
      cursor: "cursor",
      calculadora: "calculator",
      calc: "calculator",
      terminal: "powershell",
      powershell: "powershell",
      cmd: "cmd",
      configuracion: "settings",
      configuración: "settings"
    };
    for (const [alias, name] of Object.entries(appAliases)) {
      if (target.includes(alias)) {
        return { action: "open_app", args: { name }, say: `Abriendo ${name}.` };
      }
    }
    if (/^https?:\/\//.test(target)) {
      return { action: "open_url", args: { url: target }, say: "Abriendo enlace." };
    }
  }

  const searchMatch = t.match(/^(busca|buscar|search)\s+(.+)$/);
  if (searchMatch) {
    return {
      action: "search_web",
      args: { query: searchMatch[2] },
      say: `Buscando ${searchMatch[2]}.`
    };
  }

  return null;
}

module.exports = { runAction, matchLocalCommand };
