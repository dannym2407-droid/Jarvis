const actions = require("./system");
const extra = require("./extra");
const pro = require("./pro");
const power = require("./power");
const flex = require("./flex");
const git = require("./git");
const { delegateCodingTask, longInstructionPlan } = require("./delegate");
const { diagnoseWhyBroken, radarPayload, workspaceBrief } = require("../sense/workspace");
const { explainTerminal } = require("./terminal");
const { healthcheckProject, startProjectStack, getProjectProfile } = require("./projects");
const { getOffer, clearOffer } = require("../core/confirm");
const { whatsappMessage } = require("./whatsapp");

const APP_ALIASES = [
  ["whatsapp", "whatsapp"],
  ["wasap", "whatsapp"],
  ["chrome", "chrome"],
  ["navegador", "chrome"],
  ["opera", "opera"],
  ["edge", "edge"],
  ["notepad", "notepad"],
  ["bloc", "notepad"],
  ["explorador", "explorer"],
  ["archivos", "explorer"],
  ["spotify", "spotify"],
  ["discord", "discord"],
  ["visual studio code", "vscode"],
  ["vs code", "vscode"],
  ["vscode", "vscode"],
  ["visual", "vscode"],
  ["cursor", "cursor"],
  ["calculadora", "calculator"],
  ["calc", "calculator"],
  ["terminal", "powershell"],
  ["powershell", "powershell"],
  ["cmd", "cmd"],
  ["configuracion", "settings"],
  ["youtube", "youtube"],
  ["github", "github"],
  ["paint", "paint"],
  ["camara", "camera"],
  ["cámara", "camera"]
];

function resolveAppName(target) {
  const t = String(target || "").toLowerCase().trim();
  for (const [alias, name] of APP_ALIASES) {
    if (t === alias || t.includes(alias)) return name;
  }
  return null;
}

async function runAction(action, args = {}) {
  switch (action) {
    case "open_app":
      if (args.name === "paint") return extra.openPaint();
      if (args.name === "camera") return extra.openCamera();
      return actions.openApp(args.name);
    case "open_url":
      return actions.openUrl(args.url);
    case "open_path":
      return actions.openPath(args.path);
    case "open_folder":
      return actions.openFolder(args.name);
    case "open_site":
      return extra.openSite(args.name);
    case "search_web":
      return actions.searchWeb(args.query, { browser: args.browser, type: args.type });
    case "search_youtube":
      return actions.searchYoutube(args.query);
    case "search_maps":
      return extra.searchMaps(args.query);
    case "search_wikipedia":
      return extra.searchWikipedia(args.query);
    case "whatsapp_message":
      return whatsappMessage(args);
    case "volume":
      return actions.setVolume(args);
    case "media":
      return extra.mediaKey(args.control || "play");
    case "lock":
      return actions.lockPc();
    case "sleep":
      return actions.sleepPc();
    case "screenshot":
      return actions.screenshot();
    case "snip":
      return extra.openSnippingTool();
    case "show_desktop":
      return extra.showDesktop();
    case "task_manager":
      return extra.openTaskManager();
    case "tell_time":
      return actions.tellTime();
    case "tell_date":
      return actions.tellDate();
    case "weather":
      return actions.getWeather(args.city);
    case "battery":
      return actions.batteryStatus();
    case "system_status":
      return actions.systemStatus();
    case "wifi_info":
      return extra.wifiInfo();
    case "note":
      return actions.saveNote(args.text);
    case "clipboard":
      return actions.readClipboard();
    case "copy_clipboard":
      return extra.copyToClipboard(args.text);
    case "type_text":
      return actions.typeText(args.text);
    case "empty_recycle":
      return actions.emptyRecycleBin();
    case "joke":
      return actions.tellJoke();
    case "motivation":
      return extra.motivation();
    case "whoami":
      return extra.whoAmI(args.userName || "tú");
    case "crypto":
      return extra.cryptoPrice(args.symbol);
    case "timer":
      return extra.setTimer(args);
    case "coin_flip":
      return extra.flipCoin();
    case "dice":
      return extra.rollDice(args.sides);
    case "password":
      return extra.generatePassword(args.length);
    case "create_folder":
      return extra.createFolder(args.name);
    case "notepad_text":
      return extra.openNotepadWithText(args.text);
    case "kill_process":
      return extra.killProcess(args.name);
    case "close_apps":
      return extra.closeOpenApps(args);
    case "list_processes":
      return extra.listProcesses();
    case "settings_page":
      return extra.openSettingsPage(args.page);
    case "shutdown":
      return extra.shutdownPc(args);
    case "email":
      return extra.sendEmail(args);
    case "news":
      return extra.newsQuick(args.topic);
    case "define":
      return extra.defineWord(args.word);
    case "run_cmd":
      return extra.runSafeCommand(args.command);
    case "mode":
      return pro.runMode(args.name);
    case "briefing":
      return pro.briefing();
    case "window":
      return pro.windowControl(args.action);
    case "clipboard_ai":
      return pro.clipboardAi(args.mode);
    case "smart_answer":
      return pro.smartAnswer(args.question);
    case "remember":
      return pro.rememberFact(args.text);
    case "recall":
      return pro.recallMemory();
    case "disk_space":
      return power.diskSpace();
    case "find_file":
      return power.findFiles({ query: args.query, root: args.root });
    case "open_found":
      return power.openFoundFile({ query: args.query });
    case "brightness":
      return power.setBrightness(args.level);
    case "night_light":
      return power.nightLight(args.on !== false);
    case "focus_assist":
      return power.focusAssist(args.mode);
    case "clear_temp":
      return power.clearTemp();
    case "restart_explorer":
      return power.restartExplorer();
    case "speedtest":
      return power.openSpeedtest();
    case "exchange":
      return power.exchangeRate(args);
    case "stock":
      return power.stockPrice(args.symbol);
    case "translate":
      return power.translateQuick(args);
    case "wiki_summary":
      return power.wikipediaSummary(args.query);
    case "ip_info":
      return power.ipInfo();
    case "routine":
      return power.launchRoutine(args.name);
    case "sticky_notes":
      return power.openStickyNotes();
    case "large_downloads":
      return power.listLargeDownloads();
    case "bluetooth":
      return power.bluetoothSettings();
    case "wifi_settings":
      return power.wifiSettings();
    case "countdown":
      return power.countdownTo(args);
    case "qr":
      return power.generateQrText(args.text);
    case "password_copy":
      return power.copyPassword(args.length);
    case "launch_any":
      return flex.launchAny(args.name);
    case "hotkey":
      return flex.hotkey(args.keys);
    case "write_file":
      return flex.writeFileSafe(args);
    case "read_file":
      return flex.readFileSafe(args);
    case "list_dir":
      return flex.listDirSafe(args);
    case "type_enter":
      return flex.typeAndEnter(args.text);
    case "start_search":
      return flex.searchEverything(args.query);
    case "open_desktop":
      return flex.openDesktopFile(args.name);
    case "desktop_note":
      return flex.createNoteOnDesktop(args);
    case "multi":
      return flex.multiRun(args.steps || [], runAction);
    case "git_status":
      return git.gitStatus(args.project);
    case "git_commit":
      return git.prepareCommit(args.project, args.message);
    case "git_push":
      return git.gitPush(args.project, args.branch);
    case "git_confirm": {
      const r = await git.handleConfirmSpeech("confirma");
      return r || { ok: false, message: "No hay nada pendiente de confirmar." };
    }
    case "git_cancel":
      return git.cancelPending();
    case "diagnose":
      return diagnoseWhyBroken();
    case "radar":
      return radarPayload().then((d) => ({
        ok: true,
        message: `Radar: CPU ${d.cpu}% · RAM ${d.ram}% · Disco ${d.disk}% · Proyecto ${d.project}. Cursor ${d.services.cursor ? "ON" : "OFF"}, Node ${d.services.backend ? "ON" : "OFF"}.`,
        radar: d
      }));
    case "workspace":
      return workspaceBrief().then((b) => ({
        ok: true,
        message: `Foco: ${b.foreground.title || b.foreground.processName}. Proyecto: ${b.project?.name || "—"}. RAM ${b.resources.ram}%.`
      }));
    case "delegate_code":
      return delegateCodingTask(args);
    case "explain_terminal":
      return explainTerminal({ project: args.project });
    case "project_health":
      return healthcheckProject(args.project);
    case "project_start":
      return startProjectStack(args.project);
    case "project_info": {
      const p = getProjectProfile(args.project);
      if (!p) return { ok: false, message: "No encontré ese proyecto." };
      return {
        ok: true,
        message: `${p.name}: ${p.path}. Puertos: ${(p.ports || []).join(", ") || "—"}. Branch: ${p.branch || "—"}.`
      };
    }
    case "accept_offer": {
      const offer = getOffer();
      if (!offer) return { ok: false, message: "No hay oferta pendiente." };
      clearOffer();
      return flex.multiRun(offer.steps || [], runAction);
    }
    case "none":
    case undefined:
    case null:
      return { ok: true, message: "" };
    default:
      // Último recurso: si parece nombre de app, intenta lanzarla
      if (action && !action.includes("_") && String(action).length < 40) {
        return flex.launchAny(action);
      }
      return { ok: false, message: `Acción desconocida: ${action}` };
  }
}

function stripWakeWord(text) {
  return String(text || "")
    .replace(
      /\b((hey|oye|ok|okay|hola|ei|ey)\s+)?(jarvis|yarvis|jarviz|yarbis|jarbi|jarbis|harvey|jarves|llaves|yavis)\b[,:]?\s*/gi,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();
}

function matchLocalCommand(rawText) {
  const cleaned = stripWakeWord(rawText);
  const t = cleaned
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");

  if (!t) return { action: "none", args: {}, say: "Te escucho, bro. Suéltalo." };

  // Confirmaciones pendientes (commit/push)
  if (git.getPending()) {
    if (/^(si|sí|ok|dale|va|confirma|confirmar|hazlo|adelante)$/.test(t) || /\bconfirma\b/.test(t)) {
      return { action: "git_confirm", args: {}, say: null };
    }
    if (/^(no|cancel|cancela|cancelar)$/.test(t) || /\bcancela\b/.test(t)) {
      return { action: "git_cancel", args: {}, say: "Cancelo." };
    }
  }

  const longPlan = longInstructionPlan(rawText);
  if (longPlan) return longPlan;

  if (/^(hola|hey|buenas|que onda|quiubo|quiúbo)$/.test(t)) {
    return {
      action: "none",
      args: {},
      say: "¿Qué onda, bro? Aquí ando. Dime qué hacemos."
    };
  }

  // Git
  if (/git status|revisa(r)? (que|qué) cambios|que cambios tengo|qué cambios tengo|estado (de )?git|cambios sin commit/.test(t)) {
    const proj = t.match(/(?:en|de|del proyecto)\s+([\w\-]+)/);
    return { action: "git_status", args: { project: proj?.[1] }, say: "Reviso tu git." };
  }
  if (/haz(me)? un commit|crea(r)? (un )?commit|commitea|commit (con|de)/.test(t)) {
    const msg = t.match(/commit(?:\s+con)?\s+["“]?(.+?)["”]?$/);
    const proj = t.match(/(?:en|de)\s+([\w\-]+)/);
    return {
      action: "git_commit",
      args: { project: proj?.[1], message: msg?.[1] && !/commit/.test(msg[1]) ? msg[1] : "" },
      say: "Te armo el commit."
    };
  }
  if (/sube (mis )?cambios|push|empuja (a |hacia )?(origin|develop|main|master)?|sube a develop|sube a main/.test(t)) {
    let branch = "main";
    if (/develop/.test(t)) branch = "develop";
    if (/master/.test(t)) branch = "master";
    if (/\bmain\b/.test(t)) branch = "main";
    const proj = t.match(/(?:de|del proyecto)\s+([\w\-]+)/);
    return { action: "git_push", args: { project: proj?.[1], branch }, say: "Preparo el push." };
  }

  if (/por que no funciona|por qué no funciona|que esta fallando|qué está fallando|diagnostico|diagnóstico|que falla|qué falla/.test(t)) {
    return { action: "diagnose", args: {}, say: "Analizo tu entorno." };
  }
  if (/explica(r)? (el )?(error|terminal|log|consola)|que dice (la )?terminal|qué dice (la )?terminal|lee (la )?terminal|analiza (el )?error/.test(t)) {
    const proj = t.match(/(?:de|del proyecto|en)\s+([\w\-]+)/);
    return { action: "explain_terminal", args: { project: proj?.[1] }, say: "Reviso el error." };
  }
  if (/health ?check|salud (del )?proyecto|puertos (del )?proyecto|esta levantado|está levantado/.test(t)) {
    const proj = t.match(/(?:de|del proyecto|en)\s+([\w\-]+)/);
    return { action: "project_health", args: { project: proj?.[1] }, say: "Chequeo puertos." };
  }
  if (/levanta(r)? (el )?proyecto|arranca(r)? (el )?stack|start(ea)? (el )?proyecto/.test(t)) {
    const proj = t.match(/(?:proyecto|stack)\s+([\w\-]+)/) || t.match(/(?:levanta|arranca)\s+([\w\-]+)/);
    return { action: "project_start", args: { project: proj?.[1] }, say: "Levanto el proyecto." };
  }
  if (/perfil (del )?proyecto|info (del )?proyecto|donde esta el proyecto|dónde está el proyecto/.test(t)) {
    const proj = t.match(/proyecto\s+([\w\-]+)/);
    return { action: "project_info", args: { project: proj?.[1] }, say: null };
  }
  if (/radar|estado (de )?(la )?pc|system radar|como esta la maquina|cómo está la máquina/.test(t)) {
    return { action: "radar", args: {}, say: null };
  }
  if (/que estoy (usando|haciendo)|qué estoy (usando|haciendo)|que tengo abierto|qué tengo abierto|entorno|workspace/.test(t)) {
    return { action: "workspace", args: {}, say: null };
  }

  if (/briefing|reporte|como esta todo|cómo está todo|status general/.test(t)) {
    return { action: "briefing", args: {}, say: "Te armo el briefing." };
  }

  const startSearch = t.match(/(?:busca(?:r)? en (?:inicio|el menu|el menú)|abre desde inicio)\s+(.+)$/);
  if (startSearch) {
    return { action: "start_search", args: { query: startSearch[1].trim() }, say: `Busco ${startSearch[1].trim()} en Inicio.` };
  }

  const deskNote = t.match(/(?:crea(?:r)?|haz|guarda)\s+(?:una\s+)?nota(?:\s+en\s+el\s+escritorio)?\s+(?:llamada\s+)?(.+?)(?:\s+con\s+|:\s*)(.+)$/);
  if (deskNote) {
    return {
      action: "desktop_note",
      args: { title: deskNote[1].trim(), content: deskNote[2].trim() },
      say: "Creo la nota en el escritorio."
    };
  }

  const deskOpen = t.match(/(?:abre|abrir)\s+(?:del\s+)?escritorio\s+(.+)$/);
  if (deskOpen) {
    return { action: "open_desktop", args: { name: deskOpen[1].trim() }, say: null };
  }

  // Pedidos compuestos simples: "abre X y busca Y"
  const compound = t.match(/^(abre|abrir)\s+(.+?)\s+y\s+(busca|buscar|googlea)\s+(.+)$/);
  if (compound) {
    const app = resolveAppName(compound[2].trim()) || compound[2].trim();
    return {
      action: "multi",
      args: {
        steps: [
          { action: resolveAppName(compound[2].trim()) ? "open_app" : "launch_any", args: { name: app } },
          { action: "search_web", args: { query: compound[4].trim(), type: "web" } }
        ]
      },
      say: "Va, abro y busco."
    };
  }

  if (/espacio (en )?(disco|disco duro)|cuanto (disco|espacio)|cuánto (disco|espacio)|disco libre/.test(t)) {
    return { action: "disk_space", args: {}, say: null };
  }
  if (/limpia(r)? (archivos )?temp|limpia(r)? temporales|borra(r)? temporales/.test(t)) {
    return { action: "clear_temp", args: {}, say: "Limpio temporales." };
  }
  if (/reinicia(r)? (el )?explorador|restart explorer/.test(t)) {
    return { action: "restart_explorer", args: {}, say: "Reinicio el Explorador." };
  }
  if (/speed ?test|prueba (de )?velocidad|que tan rapido|qué tan rápido (esta|está) (el )?internet/.test(t)) {
    return { action: "speedtest", args: {}, say: "Abro el speed test." };
  }
  if (/mi ip|ip publica|ip pública/.test(t)) {
    return { action: "ip_info", args: {}, say: null };
  }
  if (/luz nocturna|night light/.test(t)) {
    return { action: "night_light", args: { on: !/apaga|quita|desactiva/.test(t) }, say: null };
  }
  if (/no molestar|focus assist|modo concentracion|modo concentración|dnd/.test(t)) {
    return { action: "focus_assist", args: { mode: /apaga|quita|desactiva|off/.test(t) ? "off" : "priority" }, say: null };
  }
  if (/abre (bluetooth|bluetooh)|configura(r)? bluetooth/.test(t)) {
    return { action: "bluetooth", args: {}, say: "Abro Bluetooth." };
  }
  if (/abre (config (de )?wifi|ajustes (de )?wifi)|configura(r)? (el )?wifi/.test(t)) {
    return { action: "wifi_settings", args: {}, say: "Abro WiFi." };
  }
  if (/sticky notes|notas adhesivas|notitas/.test(t)) {
    return { action: "sticky_notes", args: {}, say: "Abro Sticky Notes." };
  }
  if (/archivos pesados|descargas pesadas|que pesa|qué pesa (en )?descargas/.test(t)) {
    return { action: "large_downloads", args: {}, say: null };
  }
  if (/contraseña (segura )?y copia|genera(r)? (y )?copia (una )?contraseña|password copy/.test(t)) {
    return { action: "password_copy", args: { length: 20 }, say: null };
  }

  const bright = t.match(/(?:brillo|brightness)\s*(?:a|al|de)?\s*(\d{1,3})/);
  if (bright) {
    return { action: "brightness", args: { level: Number(bright[1]) }, say: null };
  }
  if (/sube (el )?brillo/.test(t)) return { action: "brightness", args: { level: 90 }, say: "Subo brillo." };
  if (/baja (el )?brillo/.test(t)) return { action: "brightness", args: { level: 30 }, say: "Bajo brillo." };

  const findF = t.match(/(?:busca(?:r)?|encuentra|localiza)\s+(?:el\s+)?(?:archivo|file)\s+(.+)$/);
  if (findF) {
    return { action: "find_file", args: { query: findF[1].trim() }, say: `Busco ${findF[1].trim()}.` };
  }
  const openF = t.match(/(?:abre|abrir)\s+(?:el\s+)?archivo\s+(.+)$/);
  if (openF) {
    return { action: "open_found", args: { query: openF[1].trim() }, say: `Busco y abro ${openF[1].trim()}.` };
  }

  const fx = t.match(
    /(?:cuanto(?:s)? (?:es|son)|cuánto(?:s)? (?:es|son)|convierte|cambia)\s+(\d+(?:[.,]\d+)?)\s*(dolares|dólares|usd|quetzales|gtq|euros|eur)\s*(?:a|en|por)?\s*(dolares|dólares|usd|quetzales|gtq|euros|eur)?/
  );
  if (fx) {
    const map = { dolares: "USD", dólares: "USD", usd: "USD", quetzales: "GTQ", gtq: "GTQ", euros: "EUR", eur: "EUR" };
    const from = map[fx[2]] || "USD";
    const to = map[fx[3]] || (from === "USD" ? "GTQ" : "USD");
    return {
      action: "exchange",
      args: { amount: Number(String(fx[1]).replace(",", ".")), from, to },
      say: null
    };
  }

  const stock = t.match(/(?:precio|cotiza(?:cion|ción)?)\s+(?:de\s+)?(aapl|tsla|msft|googl|amzn|nvda|meta|[A-Z]{1,5})\b/);
  if (stock) return { action: "stock", args: { symbol: stock[1] }, say: null };

  const tr = t.match(/(?:traduce(?:r)?(?:\s+al\s+(ingles|inglés|español|espanol))?\s+)(.+)$/);
  if (tr && !/portapapeles/.test(t)) {
    const to = /espanol|español/.test(tr[1] || "") ? "es" : "en";
    return { action: "translate", args: { text: tr[2].trim(), to }, say: null };
  }

  const wikiSum = t.match(/(?:resumen(?:\s+de)?|que es|qué es|quien es|quién es)\s+(.+)$/);
  if (wikiSum && wikiSum[1].length < 80 && !/hora|fecha|clima/.test(t)) {
    return { action: "wiki_summary", args: { query: wikiSum[1].trim() }, say: null };
  }

  const routine = t.match(/rutina\s+(estudio|tarea|trabajo|oficina|gaming|juego|noche)/);
  if (routine) {
    return { action: "routine", args: { name: routine[1] }, say: `Lanzo rutina ${routine[1]}.` };
  }

  const qr = t.match(/(?:genera(?:r)?|crea(?:r)?)\s+(?:un\s+)?qr\s+(?:de\s+|con\s+)?(.+)$/);
  if (qr) return { action: "qr", args: { text: qr[1].trim() }, say: "Genero el QR." };

  const cd = t.match(/(?:faltan|countdown|cuenta regresiva)\s+(?:para\s+)?(.+?)\s+(?:el\s+)?(\d{4}-\d{2}-\d{2})/);
  if (cd) {
    return { action: "countdown", args: { label: cd[1].trim(), date: cd[2] }, say: null };
  }

  const volExact = t.match(/volumen\s*(?:a|al|de)?\s*(\d{1,3})/);
  if (volExact) {
    return { action: "volume", args: { level: Number(volExact[1]) }, say: `Volumen a ${volExact[1]}.` };
  }

  const mode =
    t.match(/modo\s+(manana|mañana|enfoque|focus|coding|programar|codigo|código|chill|relax|gaming|juego|reunion|reunión|meeting)/) ||
    t.match(/activa(r)?\s+modo\s+(manana|mañana|enfoque|focus|coding|chill|gaming|reunion|reunión)/);
  if (mode) {
    const name = mode[1] || mode[2];
    return { action: "mode", args: { name }, say: `Activo modo ${name}.` };
  }

  if (/ventana (a la )?izquierda|snap (a la )?izquierda|pon(la|lo)? a la izquierda/.test(t)) {
    return { action: "window", args: { action: "left" }, say: "La mando a la izquierda." };
  }
  if (/ventana (a la )?derecha|snap (a la )?derecha|pon(la|lo)? a la derecha/.test(t)) {
    return { action: "window", args: { action: "right" }, say: "La mando a la derecha." };
  }
  if (/maximiza(r)?( la ventana)?/.test(t)) {
    return { action: "window", args: { action: "maximize" }, say: "Maximizo." };
  }

  if (/resume (el )?portapapeles|resume esto|resumen del portapapeles/.test(t)) {
    return { action: "clipboard_ai", args: { mode: "summary" }, say: "Resumo lo del portapapeles." };
  }
  if (/traduce (el )?portapapeles|traduce esto/.test(t)) {
    return { action: "clipboard_ai", args: { mode: "translate" }, say: "Traduzco eso." };
  }
  if (/mejora (el )?portapapeles|mejora este texto/.test(t)) {
    return { action: "clipboard_ai", args: { mode: "improve" }, say: "Lo mejoro." };
  }
  if (/explica (el )?portapapeles|explica esto/.test(t)) {
    return { action: "clipboard_ai", args: { mode: "explain" }, say: "Te lo explico." };
  }

  const remember = t.match(/(?:recuerda|acordate|acuérdate|guarda en memoria)\s+(.+)$/);
  if (remember) {
    return { action: "remember", args: { text: remember[1].trim() }, say: "Lo guardo en memoria." };
  }
  if (/que recuerdas|qué recuerdas|mi memoria|recuerdos/.test(t)) {
    return { action: "recall", args: {}, say: null };
  }

  if (/quien eres|quién eres|que eres|qué eres|presentate|preséntate/.test(t)) {
    return { action: "whoami", args: {}, say: null };
  }
  if (/que hora|hora es/.test(t)) return { action: "tell_time", args: {}, say: null };
  if (/que dia|que fecha/.test(t)) return { action: "tell_date", args: {}, say: null };
  if (/bloquea|lock/.test(t)) return { action: "lock", args: {}, say: "Bloqueo la sesión." };
  if (/muestra (el )?escritorio|minimiza todo|minimiza todo/.test(t)) {
    return { action: "show_desktop", args: {}, say: "Te limpio el escritorio." };
  }
  if (/administrador de tareas|task manager/.test(t)) {
    return { action: "task_manager", args: {}, say: "Abro el administrador." };
  }
  if (/recorta|snipping|recorte/.test(t)) return { action: "snip", args: {}, say: "Recorte listo." };
  if (/captura|screenshot|pantallazo/.test(t)) {
    return { action: "screenshot", args: {}, say: "Capturo pantalla." };
  }
  if (/abre (la )?camara|abre (la )?cámara/.test(t)) {
    return { action: "open_app", args: { name: "camera" }, say: "Abro la cámara." };
  }
  if (/abre paint|abre el paint/.test(t)) {
    return { action: "open_app", args: { name: "paint" }, say: "Abro Paint." };
  }
  if (/sube (el )?volumen|volumen arriba/.test(t)) {
    return { action: "volume", args: { delta: 10 }, say: "Subo volumen." };
  }
  if (/baja (el )?volumen|volumen abajo/.test(t)) {
    return { action: "volume", args: { delta: -10 }, say: "Bajo volumen." };
  }
  if (/\bmute\b|silencio/.test(t)) {
    return { action: "volume", args: { mute: true }, say: "Silencio." };
  }
  if (/pausa(r)? (la )?musica|play|reproduce|siguiente (cancion|canción)|anterior (cancion|canción)/.test(t)) {
    let control = "play";
    if (/siguiente/.test(t)) control = "next";
    else if (/anterior/.test(t)) control = "prev";
    else if (/pausa/.test(t)) control = "pause";
    return { action: "media", args: { control }, say: "Va con la música." };
  }
  if (/bateria|batería/.test(t)) return { action: "battery", args: {}, say: null };
  if (/estado (del )?sistema|como esta la pc|cómo está la pc|rendimiento/.test(t)) {
    return { action: "system_status", args: {}, say: null };
  }
  if (/wifi|clave del wifi|red (wifi)?/.test(t) && !/config/.test(t)) {
    return { action: "wifi_info", args: {}, say: null };
  }
  if (/portapapeles|clipboard|que copie|qué copié/.test(t)) {
    return { action: "clipboard", args: {}, say: null };
  }
  if (/vac[ií]a(r)? (la )?papelera/.test(t)) {
    return { action: "empty_recycle", args: {}, say: "Vacío la papelera." };
  }
  if (/chiste|hazme reir|hazme reír/.test(t)) return { action: "joke", args: {}, say: null };
  if (/motivame|motívame|motivacion|motivación|animo|ánimo/.test(t)) {
    return { action: "motivation", args: {}, say: null };
  }
  if (/lanza (una )?moneda|cara o escudo|cara o cruz/.test(t)) {
    return { action: "coin_flip", args: {}, say: null };
  }
  if (/tira (un )?dado|lanza (un )?dado/.test(t)) {
    return { action: "dice", args: { sides: 6 }, say: null };
  }
  if (/genera(r)? (una )?contraseña|password|clave segura/.test(t)) {
    return { action: "password", args: { length: 16 }, say: null };
  }
  if (/que apps|qué apps|que tengo abierto|qué tengo abierto|procesos|apps abiertas/.test(t)) {
    return { action: "list_processes", args: {}, say: null };
  }

  // Cerrar TODAS las apps: solo si lo dice EXPLÍCITO (todas / todo)
  if (
    /cierra(r)? todas( las)? (apps|aplicaciones|ventanas)/.test(t) ||
    /cierra(r)? todo lo abierto/.test(t) ||
    /cerrar todas( las)? (apps|aplicaciones)/.test(t)
  ) {
    return {
      action: "close_apps",
      args: {},
      say: "Va, cierro todas las apps abiertas."
    };
  }

  // Cerrar UNA app específica (nunca “todas” aquí)
  const kill = t.match(
    /(?:cierra|cerrar|mata|matar|kill)\s+(?:la\s+|el\s+|las\s+|los\s+)?(?:app\s+|aplicacion\s+|aplicación\s+|proceso\s+)?(.+)$/
  );
  if (kill && !/sesion|sesión|apagado/.test(t)) {
    let cleanedTarget = String(kill[1] || "")
      .replace(/\b(por favor|please|ya|ahora)\b/g, "")
      .replace(/^(la|el|las|los)\s+/g, "")
      .trim();

    // Evita cerrar todo por accidente
    if (
      /^(todas|todo)\b/.test(cleanedTarget) ||
      /^(apps|aplicaciones|ventanas)(\s+abiertas)?$/.test(cleanedTarget) ||
      /aplicaciones abiertas|apps abiertas/.test(cleanedTarget)
    ) {
      return {
        action: "none",
        args: {},
        say: "Para cerrar todo di: cierra todas las aplicaciones. Si es una sola, di: cierra Chrome."
      };
    }

    if (cleanedTarget) {
      return {
        action: "kill_process",
        args: { name: cleanedTarget },
        say: `Cierro ${cleanedTarget}.`
      };
    }
    return {
      action: "none",
      args: {},
      say: "Dime el nombre de la app, por ejemplo: cierra Chrome."
    };
  }

  if (/cancel(a|ar) (el )?apagado|cancel(a|ar) reinicio/.test(t)) {
    return { action: "shutdown", args: { mode: "abort" }, say: "Cancelo el apagado." };
  }
  if (/apaga(r)? (la )?(pc|computadora|compu)|shutdown/.test(t)) {
    return { action: "shutdown", args: { mode: "shutdown", delaySeconds: 30 }, say: null };
  }
  if (/reinicia(r)? (la )?(pc|computadora|compu)|restart/.test(t)) {
    return { action: "shutdown", args: { mode: "restart", delaySeconds: 30 }, say: null };
  }

  const weather = t.match(/(?:clima|tiempo)(?:\s+(?:en|de)\s+(.+))?$/);
  if (weather && !/busca/.test(t)) {
    return { action: "weather", args: { city: (weather[1] || "Guatemala").trim() }, say: null };
  }

  const crypto = t.match(/(?:precio|cuanto vale|cuánto vale)\s+(de\s+)?(btc|bitcoin|eth|ethereum|sol|solana|doge)/);
  if (crypto) return { action: "crypto", args: { symbol: crypto[2] }, say: null };
  if (/\b(bitcoin|btc|ethereum|eth)\b/.test(t) && /precio|vale|cuesta/.test(t)) {
    return { action: "crypto", args: { symbol: "bitcoin" }, say: null };
  }

  const timer = t.match(/(?:temporizador|timer|alarm[ae])\s+(?:de\s+)?(\d+)\s*(segundos|segundo|minutos|minuto|mins|min|s)?(?:\s+(?:para|de)\s+(.+))?/);
  if (timer) {
    let secs = Number(timer[1]);
    const unit = timer[2] || "segundos";
    if (/min/.test(unit)) secs *= 60;
    return {
      action: "timer",
      args: { seconds: secs, label: timer[3] || "tu aviso" },
      say: null
    };
  }

  const note = t.match(/(?:anota|anotar|nota|recuerdame|recuérdame)\s+(.+)$/);
  if (note) return { action: "note", args: { text: note[1].trim() }, say: "Lo dejo anotado." };

  const copy = t.match(/(?:copia|copiar)\s+(.+)$/);
  if (copy) return { action: "copy_clipboard", args: { text: copy[1].trim() }, say: "Lo copio." };

  const typeCmd = t.match(/(?:escribe|escribir|tipea|tipear)\s+(.+)$/);
  if (typeCmd && !/whatsapp|wasap/.test(t)) {
    return { action: "type_text", args: { text: typeCmd[1].trim() }, say: "Escribo eso." };
  }

  const folderCreate = t.match(/crea(r)? (una )?carpeta(?:\s+llamada)?\s+(.+)$/);
  if (folderCreate) {
    return { action: "create_folder", args: { name: folderCreate[3].trim() }, say: "Creo la carpeta." };
  }

  const maps = t.match(/(?:mapa|mapas|ubicacion|ubicación|como llegar|cómo llegar)\s+(?:a\s+|de\s+)?(.+)$/);
  if (maps) return { action: "search_maps", args: { query: maps[1].trim() }, say: "Abro el mapa." };

  const wiki = t.match(/(?:wikipedia|wiki)\s+(.+)$/);
  if (wiki) return { action: "search_wikipedia", args: { query: wiki[1].trim() }, say: "Busco en Wikipedia." };

  const define = t.match(/(?:define|que significa|qué significa|significado de)\s+(.+)$/);
  if (define) return { action: "define", args: { word: define[1].trim() }, say: "Te busco la definición." };

  const news = t.match(/noticias(?:\s+de\s+(.+))?$/);
  if (news) return { action: "news", args: { topic: news[1] || "Guatemala" }, say: "Abro noticias." };

  const site = t.match(
    /^(?:abre|abrir)\s+(gmail|drive|calendar|docs|translate|netflix|tiktok|instagram|facebook|twitter|reddit|linkedin|amazon|mercado|chatgpt|meet|zoom|github|youtube)$/
  );
  if (site) return { action: "open_site", args: { name: site[1] }, say: `Abro ${site[1]}.` };

  const settings = t.match(
    /(?:abre|abrir)\s+(?:configuracion|configuración)\s+(wifi|bluetooth|pantalla|display|sonido|sound|actualizacion|update|apps)?/
  );
  if (settings) {
    return {
      action: "settings_page",
      args: { page: settings[1] || "" },
      say: "Abro configuración."
    };
  }

  const yt =
    t.match(/(?:youtube|en youtube)\s+(?:busca|buscar)?\s*(.+)$/) ||
    t.match(/busca(?:r)?\s+(.+)\s+en youtube$/);
  if (yt) {
    return { action: "search_youtube", args: { query: yt[1].trim() }, say: "Lo busco en YouTube." };
  }

  const folder = t.match(
    /(?:abre|abrir)\s+(?:la\s+|el\s+)?(escritorio|desktop|descargas|downloads|documentos|documents|imagenes|pictures|musica|music|videos|home|inicio|jarvis)\b/
  );
  if (folder) {
    return { action: "open_folder", args: { name: folder[1] }, say: `Abro ${folder[1]}.` };
  }

  const wa =
    t.match(
      /(?:abre\s+)?(?:whatsapp|wasap|watsap).*(?:escribe(?:le)?|mandale|manda|escribele|enviale|envia|dile)\s+(?:a\s+)?(.+?)(?:\s+(?:dile|diciendo|que|mensaje|:)\s+|\s*:\s*)(.+)$/
    ) ||
    t.match(
      /(?:escribe(?:le)?|mandale|manda|enviale|enviarle|mandarle)\s+(?:un\s+mensaje\s+)?(?:a\s+)?(.+?)\s+(?:por\s+)?(?:whatsapp|wasap|watsap)\s+(?:dile|diciendo|que|:)?\s*(.+)$/
    ) ||
    t.match(
      /(?:whatsapp|wasap|watsap)\s+(?:a\s+)?(.+?)\s*:\s*(.+)$/
    ) ||
    t.match(
      /(?:dile|decile)\s+a\s+(.+?)\s+por\s+(?:whatsapp|wasap)\s+(?:que\s+)?(.+)$/
    );

  if (wa) {
    return {
      action: "whatsapp_message",
      args: { contact: wa[1].trim(), message: wa[2].trim(), send: true },
      say: `Le escribo a ${wa[1].trim()} por WhatsApp.`
    };
  }

  // Búsquedas tipadas
  const typedSearch =
    t.match(/busca(?:r)?\s+(imagenes|imágenes|fotos|videos|vídeos|noticias|compras|shopping)\s+(?:de\s+|sobre\s+)?(.+)$/) ||
    t.match(/busca(?:r)?\s+(.+)\s+en\s+(imagenes|imágenes|fotos|videos|vídeos|noticias|compras|google|duckduckgo)$/);

  if (typedSearch) {
    let type = "web";
    let query = "";
    if (/imagen|foto/.test(typedSearch[1])) {
      type = "images";
      query = typedSearch[2];
    } else if (/video|vídeo/.test(typedSearch[1])) {
      type = "videos";
      query = typedSearch[2];
    } else if (/noticia/.test(typedSearch[1])) {
      type = "news";
      query = typedSearch[2];
    } else if (/compra|shop/.test(typedSearch[1])) {
      type = "shopping";
      query = typedSearch[2];
    } else if (/duck/.test(typedSearch[2] || "")) {
      type = "duck";
      query = typedSearch[1];
    } else if (/imagen|foto|video|vídeo|noticia|compra|shop/.test(typedSearch[2] || "")) {
      const kind = typedSearch[2];
      query = typedSearch[1];
      if (/imagen|foto/.test(kind)) type = "images";
      else if (/video|vídeo/.test(kind)) type = "videos";
      else if (/noticia/.test(kind)) type = "news";
      else if (/compra|shop/.test(kind)) type = "shopping";
    } else {
      query = typedSearch[1];
      const kind = typedSearch[2] || "";
      if (/imagen|foto/.test(kind)) type = "images";
      else if (/video/.test(kind)) type = "videos";
      else if (/noticia/.test(kind)) type = "news";
      else if (/compra|shop/.test(kind)) type = "shopping";
      else if (/duck/.test(kind)) type = "duck";
    }
    return {
      action: "search_web",
      args: { query: String(query || "").trim(), type },
      say: `Busco eso.`
    };
  }

  const browseSearch =
    t.match(
      /(?:abre\s+(?:el\s+)?(?:navegador|chrome|edge|opera)?\s*(?:y\s+)?)?(?:busca|buscar|search|googlea|google)\s+(.+)$/
    ) || t.match(/^google(?:a|ar)?\s+(.+)$/);

  if (browseSearch && !/whatsapp|wasap|youtube/.test(t)) {
    return {
      action: "search_web",
      args: { query: browseSearch[1].trim(), type: "web" },
      say: `Busco ${browseSearch[1].trim()}.`
    };
  }

  const openMatch = t.match(/^(abre|abrir|open)\s+(?:el\s+|la\s+)?(.+)$/);
  if (openMatch) {
    const target = openMatch[2].trim();
    const app = resolveAppName(target);
    if (app) return { action: "open_app", args: { name: app }, say: `Abro ${app}.` };
    if (/^https?:\/\//.test(target)) {
      return { action: "open_url", args: { url: target }, say: "Abro el link." };
    }
  }

  // Conversación libre → la IA
  return null;
}

module.exports = { runAction, matchLocalCommand, stripWakeWord, resolveAppName };
