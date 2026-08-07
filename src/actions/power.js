const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const { runShell, openUrl, openPath, openApp } = require("./system");
const { openSettingsPage, copyToClipboard, openSite } = require("./extra");

const execFileAsync = promisify(execFile);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function diskSpace() {
  try {
    const out = await runShell(
      `Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Used -ne $null } | ForEach-Object { $free=[math]::Round($_.Free/1GB,1); $used=[math]::Round($_.Used/1GB,1); "$($_.Name): ${free} GB libres / ${used} GB usados" } | Out-String`
    );
    const text = String(out || "").trim().replace(/\s+\n/g, "\n");
    return { ok: true, message: text || "No pude leer el disco." };
  } catch (error) {
    return { ok: false, message: `Disco: ${String(error.message || error).slice(0, 160)}` };
  }
}

async function findFiles({ query, root } = {}) {
  const q = String(query || "").trim();
  if (!q) return { ok: false, message: "Dime qué archivo busco." };
  const base = root || path.join(os.homedir(), "Downloads");
  try {
    const script = `
$ErrorActionPreference='SilentlyContinue'
Get-ChildItem -Path ${JSON.stringify(base)} -Recurse -File -Filter ${JSON.stringify(`*${q}*`)} -Depth 4 |
  Select-Object -First 8 FullName |
  ForEach-Object { $_.FullName }
`;
    const out = await runShell(script);
    const lines = String(out || "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) {
      return { ok: true, message: `No encontré "${q}" en Descargas (búsqueda rápida).` };
    }
    return {
      ok: true,
      message: `Encontré ${lines.length}: ${lines.map((p) => path.basename(p)).join(", ")}.`,
      paths: lines
    };
  } catch (error) {
    return { ok: false, message: `Búsqueda falló: ${String(error.message || error).slice(0, 160)}` };
  }
}

async function openFoundFile({ query } = {}) {
  const result = await findFiles({ query });
  if (!result.ok || !result.paths?.length) return result;
  await openPath(result.paths[0]);
  return { ok: true, message: `Abrí ${path.basename(result.paths[0])}.` };
}

async function setBrightness(level = 70) {
  const n = Math.max(0, Math.min(100, Number(level) || 70));
  try {
    await runShell(`
$ErrorActionPreference='SilentlyContinue'
$m = Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods
if ($m) { $m.WmiSetBrightness(1, ${n}) | Out-Null; 'ok' } else { 'unsupported' }
`);
    return { ok: true, message: `Brillo a ${n}%.` };
  } catch {
    await openSettingsPage("display");
    return { ok: true, message: "No pude cambiar el brillo directo; abrí pantalla." };
  }
}

async function nightLight(on = true) {
  try {
    // Abre la página de noche; toggle fiable vía settings UI es limitado sin APIs privadas
    await openSettingsPage("display");
    return {
      ok: true,
      message: on
        ? "Abrí configuración de pantalla para luz nocturna."
        : "Abrí pantalla; ahí apagas la luz nocturna."
    };
  } catch (error) {
    return { ok: false, message: String(error.message || error).slice(0, 160) };
  }
}

async function focusAssist(mode = "priority") {
  // Windows Focus Assist / Do Not Disturb settings
  await openUrl("ms-settings:quiethours");
  const label =
    mode === "off" ? "desactivar" : mode === "alarms" ? "solo alarmas" : "prioridad";
  return { ok: true, message: `Abrí No molestar / Focus Assist (${label}).` };
}

async function clearTemp() {
  try {
    await runShell(`
$ErrorActionPreference='SilentlyContinue'
Remove-Item -Path "$env:TEMP\\*" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path "$env:LOCALAPPDATA\\Temp\\*" -Recurse -Force -ErrorAction SilentlyContinue
'ok'
`);
    return { ok: true, message: "Limpié archivos temporales." };
  } catch (error) {
    return { ok: false, message: `Limpieza: ${String(error.message || error).slice(0, 160)}` };
  }
}

async function restartExplorer() {
  try {
    await runShell(`
Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue
Start-Process explorer
`);
    return { ok: true, message: "Reinicié el Explorador." };
  } catch (error) {
    return { ok: false, message: String(error.message || error).slice(0, 160) };
  }
}

async function openSpeedtest() {
  return openUrl("https://fast.com");
}

async function exchangeRate({ from = "USD", to = "GTQ", amount = 1 } = {}) {
  const a = Number(amount) || 1;
  const f = String(from || "USD").toUpperCase();
  const t = String(to || "GTQ").toUpperCase();
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(f)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const rate = data?.rates?.[t];
    if (!rate) return { ok: false, message: `No tengo la tasa ${f}→${t}.` };
    const total = (a * rate).toFixed(2);
    return { ok: true, message: `${a} ${f} son unos ${total} ${t}.` };
  } catch (error) {
    return { ok: false, message: `Cambio: ${String(error.message || error).slice(0, 140)}` };
  }
}

async function stockPrice(symbol = "AAPL") {
  const s = String(symbol || "AAPL").toUpperCase().replace(/[^A-Z.]/g, "");
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?interval=1d&range=1d`,
      { headers: { "User-Agent": "Mozilla/5.0 Jarvis" } }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    const cur = data?.chart?.result?.[0]?.meta?.currency || "USD";
    if (price == null) return { ok: false, message: `No encontré ${s}.` };
    return { ok: true, message: `${s} está en ${Number(price).toFixed(2)} ${cur}.` };
  } catch (error) {
    return openUrl(`https://finance.yahoo.com/quote/${encodeURIComponent(s)}`);
  }
}

async function translateQuick({ text, to = "en" } = {}) {
  const q = String(text || "").trim();
  if (!q) return { ok: false, message: "¿Qué traduzco?" };
  const lang = String(to || "en").toLowerCase().startsWith("es") ? "es" : "en";
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=${
      lang === "es" ? "en|es" : "es|en"
    }`;
    const res = await fetch(url);
    const data = await res.json();
    const out = data?.responseData?.translatedText;
    if (!out) throw new Error("sin traducción");
    return { ok: true, message: out };
  } catch {
    return openUrl(
      `https://translate.google.com/?sl=auto&tl=${lang}&text=${encodeURIComponent(q)}`
    );
  }
}

async function wikipediaSummary(query) {
  const q = String(query || "").trim();
  if (!q) return { ok: false, message: "¿De qué busco en Wikipedia?" };
  try {
    const search = await fetch(
      `https://es.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(q)}&limit=1&namespace=0&format=json`
    );
    const arr = await search.json();
    const title = arr?.[1]?.[0];
    if (!title) return { ok: false, message: `No hallé "${q}" en Wikipedia.` };
    const page = await fetch(
      `https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
    );
    const data = await page.json();
    const extract = String(data?.extract || "").slice(0, 420);
    return { ok: true, message: extract || `Abrí ${title}.`, title };
  } catch (error) {
    return { ok: false, message: String(error.message || error).slice(0, 160) };
  }
}

async function ipInfo() {
  try {
    const res = await fetch("https://api.ipify.org?format=json");
    const data = await res.json();
    return { ok: true, message: `Tu IP pública es ${data.ip}.` };
  } catch {
    return { ok: false, message: "No pude leer tu IP." };
  }
}

async function launchRoutine(name = "study") {
  const n = String(name || "study").toLowerCase();
  if (/study|estudio|tarea|tarea/.test(n)) {
    await openApp("vscode");
    await sleep(400);
    await openSite("drive");
    await sleep(200);
    return { ok: true, message: "Rutina estudio: VS Code y Drive." };
  }
  if (/work|trabajo|oficina/.test(n)) {
    await openApp("chrome");
    await sleep(300);
    await openSite("gmail");
    await sleep(200);
    await openSite("calendar");
    return { ok: true, message: "Rutina trabajo: Chrome, Gmail y Calendar." };
  }
  if (/game|juego|gaming/.test(n)) {
    await openApp("discord");
    await sleep(300);
    await openApp("spotify");
    return { ok: true, message: "Rutina gaming: Discord y Spotify." };
  }
  if (/night|noche|sleep/.test(n)) {
    await openSettingsPage("display");
    return { ok: true, message: "Rutina noche: abrí pantalla para luz nocturna." };
  }
  return { ok: false, message: "Rutinas: estudio, trabajo, gaming o noche." };
}

async function openStickyNotes() {
  try {
    await execFileAsync("powershell", ["-NoProfile", "-Command", "Start-Process shell:AppsFolder\\Microsoft.MicrosoftStickyNotes_8wekyb3d8bbwe!App"], {
      windowsHide: true
    });
    return { ok: true, message: "Abrí Sticky Notes." };
  } catch {
    return openApp("notepad");
  }
}

async function listLargeDownloads() {
  const base = path.join(os.homedir(), "Downloads");
  try {
    const out = await runShell(`
Get-ChildItem -Path ${JSON.stringify(base)} -File -ErrorAction SilentlyContinue |
  Sort-Object Length -Descending |
  Select-Object -First 5 Name,@{N='MB';E={[math]::Round($_.Length/1MB,1)}} |
  ForEach-Object { "$($_.Name) ($($_.MB) MB)" }
`);
    const text = String(out || "").trim();
    return {
      ok: true,
      message: text ? `Lo más pesado en Descargas: ${text.replace(/\r?\n/g, "; ")}.` : "Descargas está vacío."
    };
  } catch (error) {
    return { ok: false, message: String(error.message || error).slice(0, 160) };
  }
}

async function bluetoothSettings() {
  return openSettingsPage("bluetooth");
}

async function wifiSettings() {
  return openSettingsPage("wifi");
}

async function countdownTo({ date, label } = {}) {
  const target = new Date(date);
  if (Number.isNaN(target.getTime())) {
    return { ok: false, message: "Dame una fecha válida, tipo 2026-12-25." };
  }
  const ms = target.getTime() - Date.now();
  const days = Math.ceil(ms / 86400000);
  const name = label || "esa fecha";
  if (days < 0) return { ok: true, message: `${name} ya pasó hace ${Math.abs(days)} días.` };
  if (days === 0) return { ok: true, message: `¡Hoy es ${name}!` };
  return { ok: true, message: `Faltan ${days} días para ${name}.` };
}

async function generateQrText(text) {
  const t = String(text || "").trim();
  if (!t) return { ok: false, message: "¿Qué pongo en el QR?" };
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(t)}`;
  await openUrl(url);
  return { ok: true, message: "Te abrí el QR." };
}

async function copyPassword(length = 20) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  let out = "";
  for (let i = 0; i < Math.max(8, Math.min(64, Number(length) || 20)); i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  await copyToClipboard(out);
  return { ok: true, message: `Contraseña lista y copiada (${out.length} chars).` };
}

module.exports = {
  diskSpace,
  findFiles,
  openFoundFile,
  setBrightness,
  nightLight,
  focusAssist,
  clearTemp,
  restartExplorer,
  openSpeedtest,
  exchangeRate,
  stockPrice,
  translateQuick,
  wikipediaSummary,
  ipInfo,
  launchRoutine,
  openStickyNotes,
  listLargeDownloads,
  bluetoothSettings,
  wifiSettings,
  countdownTo,
  generateQrText,
  copyPassword
};
