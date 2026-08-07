const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { runShell, openUrl, openPath, openApp, pasteText, sleep } = require("./system");

const timers = new Map();

async function mediaKey(kind) {
  const map = {
    play: "[char]179",
    pause: "[char]179",
    next: "[char]176",
    prev: "[char]177",
    stop: "[char]178"
  };
  const key = map[kind] || map.play;
  await runShell(`(New-Object -ComObject WScript.Shell).SendKeys(${key})`);
  return { ok: true, message: "Listo con el control de media." };
}

async function showDesktop() {
  await runShell(`(New-Object -ComObject Shell.Application).ToggleDesktop()`);
  return { ok: true, message: "Escritorio listo." };
}

async function openTaskManager() {
  await runShell('Start-Process "taskmgr.exe"');
  return { ok: true, message: "Abrí el Administrador de tareas." };
}

async function openSnippingTool() {
  try {
    await runShell('Start-Process "ms-screenclip:"');
  } catch {
    await runShell('Start-Process "SnippingTool.exe"');
  }
  return { ok: true, message: "Listo para capturar." };
}

async function openCamera() {
  await runShell('Start-Process "microsoft.windows.camera:"');
  return { ok: true, message: "Abrí la cámara." };
}

async function openPaint() {
  await runShell('Start-Process "mspaint.exe"');
  return { ok: true, message: "Abrí Paint." };
}

async function killProcess(name) {
  const raw = String(name || "").trim().toLowerCase();
  if (!raw) return { ok: false, message: "¿Qué app cierro?" };

  const aliases = {
    chrome: ["chrome", "Google Chrome"],
    edge: ["msedge", "Microsoft Edge"],
    opera: ["opera"],
    firefox: ["firefox"],
    spotify: ["Spotify"],
    discord: ["Discord"],
    cursor: ["Cursor"],
    vscode: ["Code"],
    code: ["Code"],
    visual: ["Code", "devenv"],
    notepad: ["notepad"],
    whatsapp: ["WhatsApp", "WhatsApp.Root"],
    calculadora: ["CalculatorApp", "Calculator", "win32calc"],
    calculator: ["CalculatorApp", "Calculator", "win32calc"],
    paint: ["mspaint"],
    camara: ["WindowsCamera"],
    cámara: ["WindowsCamera"],
    terminal: ["WindowsTerminal", "powershell", "cmd"],
    word: ["WINWORD"],
    excel: ["EXCEL"],
    powerpoint: ["POWERPNT"],
    teams: ["ms-teams", "Teams"],
    telegram: ["Telegram"],
    steam: ["steam"],
    bluestacks: ["HD-Player", "Bluestacks"]
  };

  let names = aliases[raw];
  if (!names) {
    // "google chrome" / "visual studio code"
    for (const [alias, procs] of Object.entries(aliases)) {
      if (raw.includes(alias)) {
        names = procs;
        break;
      }
    }
  }
  if (!names) {
    // usa el nombre tal cual (sin espacios raros)
    names = [raw.replace(/\s+/g, "")];
  }

  const list = names.map((n) => `'${String(n).replace(/'/g, "''")}'`).join(",");
  try {
    const out = await runShell(`
$names = @(${list})
$procs = Get-Process | Where-Object {
  $n = $_.ProcessName
  $names | Where-Object { $_ -eq $n -or $n -like ("*"+$_+"*") } | Select-Object -First 1
}
if (-not $procs) { throw 'not found' }
$procs | Stop-Process -Force
($procs | Select-Object -ExpandProperty ProcessName -Unique) -join ', '
`);
    return { ok: true, message: `Cerré ${out || raw}.` };
  } catch {
    return { ok: false, message: `No pude cerrar ${raw}. ¿Está abierta?` };
  }
}

/**
 * Cierra apps con ventana.
 * SOLO usar cuando el usuario diga explícitamente "todas" / "todo lo abierto".
 */
async function closeOpenApps({ keepCursor = true } = {}) {
  try {
    const out = await runShell(`
$protect = @(
  'explorer','dwm','csrss','winlogon','services','lsass','svchost','fontdrvhost',
  'SearchHost','StartMenuExperienceHost','ShellExperienceHost','RuntimeBroker',
  'ApplicationFrameHost','TextInputHost','SystemSettings','LockApp','sihost',
  'taskhostw','ctfmon','SecurityHealthSystray','NVIDIA Share','NVIDIA Web Helper',
  'Cursor','Code','node','powershell','WindowsTerminal','cmd','conhost',
  'chrome','msedge','opera','firefox','WhatsApp','WhatsApp.Root'
)
${keepCursor ? "" : "$protect = $protect | Where-Object { $_ -notin @('Cursor','Code') }"}
$killed = @()
Get-Process | Where-Object {
  $_.MainWindowHandle -ne 0 -and
  $_.MainWindowTitle -and
  ($protect -notcontains $_.ProcessName)
} | ForEach-Object {
  try {
    $killed += $_.ProcessName
    Stop-Process -Id $_.Id -Force -ErrorAction Stop
  } catch {}
}
if ($killed.Count -eq 0) { 'No había otras apps para cerrar.' }
else { 'Cerré: ' + (($killed | Select-Object -Unique) -join ', ') + '.' }
`);
    return { ok: true, message: out || "Listo." };
  } catch (error) {
    return { ok: false, message: `No pude cerrar las apps: ${String(error.message || "").slice(0, 120)}` };
  }
}

async function listProcesses() {
  try {
    const raw = await runShell(
      `Get-Process | Where-Object { $_.MainWindowTitle -and $_.MainWindowHandle -ne 0 } | Sort-Object ProcessName | Select-Object -First 12 -ExpandProperty ProcessName`
    );
    const names = [...new Set(raw.split(/\r?\n/).filter(Boolean))];
    return {
      ok: true,
      message: names.length ? `Tienes abierto: ${names.join(", ")}.` : "No vi apps con ventana."
    };
  } catch {
    return { ok: false, message: "No pude listar procesos." };
  }
}

async function wifiInfo() {
  try {
    const raw = await runShell(
      `(netsh wlan show interfaces) | Select-String 'SSID|Señal|Signal|Estado|State' | ForEach-Object { $_.Line.Trim() }`
    );
    const text = raw.replace(/\s+/g, " ").slice(0, 220);
    return { ok: true, message: text || "No encontré info de WiFi." };
  } catch {
    return { ok: false, message: "No pude leer el WiFi." };
  }
}

async function openSettingsPage(page = "") {
  const map = {
    wifi: "ms-settings:network-wifi",
    bluetooth: "ms-settings:bluetooth",
    display: "ms-settings:display",
    sound: "ms-settings:sound",
    update: "ms-settings:windowsupdate",
    about: "ms-settings:about",
    apps: "ms-settings:appsfeatures",
    personalization: "ms-settings:personalization"
  };
  const target = map[String(page || "").toLowerCase()] || "ms-settings:";
  await runShell(`Start-Process "${target}"`);
  return { ok: true, message: "Abrí esa configuración." };
}

async function copyToClipboard(text) {
  const value = String(text || "");
  if (!value) return { ok: false, message: "¿Qué copio?" };
  await runShell(
    `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::SetText(${JSON.stringify(value)})`
  );
  return { ok: true, message: "Copiado al portapapeles." };
}

async function searchMaps(query) {
  const q = encodeURIComponent(String(query || "").trim());
  if (!q) return openUrl("https://www.google.com/maps");
  return openUrl(`https://www.google.com/maps/search/?api=1&query=${q}`);
}

async function searchWikipedia(query) {
  const q = encodeURIComponent(String(query || "").trim());
  if (!q) return { ok: false, message: "¿Qué busco en Wikipedia?" };
  return openUrl(`https://es.wikipedia.org/wiki/Special:Search?search=${q}`);
}

async function openSite(name) {
  const sites = {
    gmail: "https://mail.google.com",
    drive: "https://drive.google.com",
    calendar: "https://calendar.google.com",
    docs: "https://docs.google.com",
    translate: "https://translate.google.com/?hl=es",
    netflix: "https://www.netflix.com",
    spotifyweb: "https://open.spotify.com",
    tiktok: "https://www.tiktok.com",
    instagram: "https://www.instagram.com",
    facebook: "https://www.facebook.com",
    twitter: "https://x.com",
    x: "https://x.com",
    reddit: "https://www.reddit.com",
    linkedin: "https://www.linkedin.com",
    amazon: "https://www.amazon.com",
    mercado: "https://www.mercadolibre.com.gt",
    chatgpt: "https://chatgpt.com",
    groq: "https://console.groq.com",
    github: "https://github.com",
    youtube: "https://www.youtube.com",
    meet: "https://meet.google.com",
    zoom: "https://zoom.us/join"
  };
  const key = String(name || "").toLowerCase().trim();
  if (!sites[key]) return { ok: false, message: `No tengo el sitio ${name}.` };
  return openUrl(sites[key]);
}

async function cryptoPrice(symbol = "bitcoin") {
  const idMap = {
    btc: "bitcoin",
    bitcoin: "bitcoin",
    eth: "ethereum",
    ethereum: "ethereum",
    sol: "solana",
    solana: "solana",
    doge: "dogecoin"
  };
  const id = idMap[String(symbol || "bitcoin").toLowerCase()] || "bitcoin";
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd,gtq`
    );
    const data = await res.json();
    const usd = data[id]?.usd;
    const gtq = data[id]?.gtq;
    if (!usd) throw new Error("sin precio");
    return {
      ok: true,
      message: `${id} está a ${usd} dólares` + (gtq ? `, unos ${Math.round(gtq)} quetzales.` : ".")
    };
  } catch {
    return openUrl(`https://www.coingecko.com/es/monedas/${id}`).then(() => ({
      ok: true,
      message: `Abrí el precio de ${id}.`
    }));
  }
}

async function setTimer({ seconds = 60, label = "temporizador" } = {}) {
  const secs = Math.max(3, Math.min(3600, Number(seconds) || 60));
  const id = Date.now().toString(36);
  const timer = setTimeout(() => {
    timers.delete(id);
    // best-effort popup
    spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `[System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms') | Out-Null; [System.Windows.Forms.MessageBox]::Show(${JSON.stringify(`Jarvis: terminó ${label}`)},'Jarvis')`
      ],
      { detached: true, stdio: "ignore", windowsHide: true }
    ).unref();
  }, secs * 1000);
  timers.set(id, timer);
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  const when = mins ? `${mins} minuto${mins === 1 ? "" : "s"}${rem ? ` y ${rem} segundos` : ""}` : `${secs} segundos`;
  return { ok: true, message: `Temporizador de ${when} para ${label}, activado.`, timerId: id };
}

function flipCoin() {
  return { ok: true, message: Math.random() < 0.5 ? "Salió cara." : "Salió escudo." };
}

function rollDice(sides = 6) {
  const n = Math.max(2, Math.min(100, Number(sides) || 6));
  const value = 1 + Math.floor(Math.random() * n);
  return { ok: true, message: `En el dado de ${n} caras salió ${value}.` };
}

function generatePassword(length = 16) {
  const len = Math.max(8, Math.min(64, Number(length) || 16));
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  let out = "";
  for (let i = 0; i < len; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return { ok: true, message: `Tu clave segura es: ${out}`, password: out };
}

async function createFolder(name) {
  const folder = String(name || "").trim().replace(/[<>:"|?*]/g, "");
  if (!folder) return { ok: false, message: "¿Cómo se llama la carpeta?" };
  const target = path.join(os.homedir(), "Desktop", folder);
  fs.mkdirSync(target, { recursive: true });
  return { ok: true, message: `Creé la carpeta ${folder} en el escritorio.`, path: target };
}

async function openNotepadWithText(text) {
  const content = String(text || "").trim();
  const file = path.join(os.tmpdir(), `jarvis-note-${Date.now()}.txt`);
  fs.writeFileSync(file, content || " ", "utf8");
  await openPath(file);
  return { ok: true, message: "Te abrí un bloc con eso." };
}

async function shutdownPc({ mode = "shutdown", delaySeconds = 30 } = {}) {
  const delay = Math.max(0, Math.min(600, Number(delaySeconds) || 30));
  if (mode === "abort") {
    await runShell("shutdown /a");
    return { ok: true, message: "Cancelé el apagado." };
  }
  const flag = mode === "restart" ? "/r" : mode === "logoff" ? "/l" : "/s";
  if (mode === "logoff") {
    await runShell("shutdown /l");
    return { ok: true, message: "Cerrando sesión." };
  }
  await runShell(`shutdown ${flag} /t ${delay}`);
  return {
    ok: true,
    message: `${mode === "restart" ? "Reinicio" : "Apagado"} en ${delay} segundos. Di cancelar apagado si te arrepientes.`
  };
}

async function sendEmail({ to, subject, body } = {}) {
  const mail = String(to || "").trim();
  if (!mail) return { ok: false, message: "¿A qué correo?" };
  const url = `mailto:${encodeURIComponent(mail)}?subject=${encodeURIComponent(subject || "")}&body=${encodeURIComponent(body || "")}`;
  await runShell(`Start-Process ${JSON.stringify(url)}`);
  return { ok: true, message: "Abrí el correo para enviarlo." };
}

async function motivation() {
  const lines = [
    "Bro, hoy también se puede. Un paso a la vez y lo armamos.",
    "No tienes que ser perfecto, solo constante. Yo te respaldo.",
    "Si está difícil, significa que estás creciendo. Dale con todo.",
    "Tu futuro yo te va a agradecer por no rendirte hoy.",
    "Menos overthinking, más acción. ¿Qué hacemos primero?"
  ];
  return { ok: true, message: lines[Math.floor(Math.random() * lines.length)] };
}

async function whoAmI(userName) {
  return {
    ok: true,
    message: `Soy Jarvis, tu asistente personal. Trabajo para ${userName}, controlo esta laptop y estoy para lo que ocupes, serio o fumado.`
  };
}

async function newsQuick(topic = "Guatemala") {
  const q = encodeURIComponent(`${topic} noticias`);
  return openUrl(`https://news.google.com/search?q=${q}&hl=es-419`);
}

async function defineWord(word) {
  const w = String(word || "").trim();
  if (!w) return { ok: false, message: "¿Qué palabra defino?" };
  return openUrl(`https://www.google.com/search?q=${encodeURIComponent(`define ${w}`)}`);
}

async function runSafeCommand(command) {
  const cmd = String(command || "").trim();
  if (!cmd) return { ok: false, message: "¿Qué comando corro?" };
  // Libertad con red de seguridad básica
  const blocked = /(format\s+|rm\s+-rf|del\s+\/s|Remove-Item\s+-Recurse\s+C:\\|shutdown\s+\/f|reg\s+delete|mimikatz|Invoke-WebRequest\s+.*\|.*iex)/i;
  if (blocked.test(cmd)) {
    return { ok: false, message: "Ese comando está bloqueado por seguridad." };
  }
  try {
    const out = await runShell(cmd);
    const short = (out || "Comando ejecutado sin salida.").slice(0, 240);
    return { ok: true, message: short };
  } catch (error) {
    return { ok: false, message: `Falló: ${String(error.message || error).slice(0, 180)}` };
  }
}

module.exports = {
  mediaKey,
  showDesktop,
  openTaskManager,
  openSnippingTool,
  openCamera,
  openPaint,
  killProcess,
  closeOpenApps,
  listProcesses,
  wifiInfo,
  openSettingsPage,
  copyToClipboard,
  searchMaps,
  searchWikipedia,
  openSite,
  cryptoPrice,
  setTimer,
  flipCoin,
  rollDice,
  generatePassword,
  createFolder,
  openNotepadWithText,
  shutdownPc,
  sendEmail,
  motivation,
  whoAmI,
  newsQuick,
  defineWord,
  runSafeCommand
};
