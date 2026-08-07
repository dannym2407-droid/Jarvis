const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const APP_MAP = {
  chrome: [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
  ],
  edge: [
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
  ],
  notepad: ["notepad.exe"],
  explorer: ["explorer.exe"],
  spotify: [path.join(os.homedir(), "AppData\\Roaming\\Spotify\\Spotify.exe")],
  discord: [path.join(os.homedir(), "AppData\\Local\\Discord\\Update.exe")],
  vscode: [
    path.join(os.homedir(), "AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe"),
    "C:\\Program Files\\Microsoft VS Code\\Code.exe"
  ],
  visualstudio: [
    "C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\Common7\\IDE\\devenv.exe",
    "C:\\Program Files\\Microsoft Visual Studio\\2022\\Professional\\Common7\\IDE\\devenv.exe",
    "C:\\Program Files\\Microsoft Visual Studio\\2022\\Enterprise\\Common7\\IDE\\devenv.exe",
    "C:\\Program Files (x86)\\Microsoft Visual Studio\\2019\\Community\\Common7\\IDE\\devenv.exe"
  ],
  cursor: [path.join(os.homedir(), "AppData\\Local\\Programs\\cursor\\Cursor.exe")],
  calculator: ["calc.exe"],
  cmd: ["cmd.exe"],
  powershell: ["powershell.exe"],
  settings: ["ms-settings:"],
  whatsapp: [
    path.join(os.homedir(), "AppData\\Local\\WhatsApp\\WhatsApp.exe"),
    path.join(os.homedir(), "AppData\\Local\\Programs\\WhatsApp\\WhatsApp.exe")
  ],
  opera: [
    path.join(os.homedir(), "AppData\\Local\\Programs\\Opera GX\\opera.exe"),
    "C:\\Program Files\\Opera GX\\opera.exe",
    "C:\\Program Files\\Opera\\opera.exe"
  ],
  youtube: ["https://www.youtube.com"],
  github: ["https://github.com"]
};

const WHATSAPP_STORE_APP =
  "shell:AppsFolder\\5319275A.WhatsAppDesktop_cv1g1gvanyjgm!App";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runDetached(command, args = []) {
  return new Promise((resolve, reject) => {
    try {
      const child = spawn(command, args, {
        detached: true,
        stdio: "ignore",
        shell: false,
        windowsHide: true
      });
      child.unref();
      resolve(true);
    } catch (error) {
      reject(error);
    }
  });
}

function runShell(command) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
      { windowsHide: true }
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => {
      stdout += c.toString();
    });
    child.stderr.on("data", (c) => {
      stderr += c.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr || stdout || `exit ${code}`));
    });
  });
}

function firstExisting(candidates = []) {
  for (const candidate of candidates) {
    if (!candidate.includes("*") && fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function psQuote(text) {
  return `'${String(text ?? "").replace(/'/g, "''")}'`;
}

/**
 * Pega texto por portapapeles (soporta acentos mejor que SendKeys).
 */
async function pasteText(text, { enter = false, delayMs = 120 } = {}) {
  const script = `
Add-Type -AssemblyName System.Windows.Forms
$w = New-Object -ComObject WScript.Shell
[System.Windows.Forms.Clipboard]::SetText(${psQuote(text)})
Start-Sleep -Milliseconds ${delayMs}
$w.SendKeys('^v')
Start-Sleep -Milliseconds 180
${enter ? "$w.SendKeys('{ENTER}')" : ""}
`;
  await runShell(script);
}

async function focusProcess(processNames = []) {
  const names = processNames.map((n) => psQuote(n)).join(",");
  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class JarvisWin {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
"@
$names = @(${names})
$p = Get-Process | Where-Object { $names -contains $_.ProcessName -and $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $p) { exit 0 }
[JarvisWin]::ShowWindow($p.MainWindowHandle, 9) | Out-Null
[JarvisWin]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
`;
  await runShell(script);
}

async function openApp(name) {
  const key = String(name || "").toLowerCase().trim();

  if (key === "youtube" || key === "github") {
    return openUrl(APP_MAP[key][0]);
  }

  const candidates = APP_MAP[key];
  if (!candidates) {
    // Intenta lanzar cualquier cosa por nombre
    try {
      await runShell(`Start-Process ${psQuote(name)}`);
      return { ok: true, message: `Abrí ${name}.` };
    } catch {
      try {
        await runShell(`cmd /c start "" ${psQuote(name)}`);
        return { ok: true, message: `Lancé ${name}.` };
      } catch {
        return { ok: false, message: `No conozco la app "${name}". Prueba: "abre ${name}" otra vez o di el .exe.` };
      }
    }
  }

  if (key === "settings") {
    await runShell('Start-Process "ms-settings:"');
    return { ok: true, message: "Abrí Configuración." };
  }

  if (key === "discord") {
    const updater = firstExisting(candidates);
    if (updater) {
      await runDetached(updater, ["--processStart", "Discord.exe"]);
      return { ok: true, message: "Abrí Discord." };
    }
  }

  if (key === "whatsapp") {
    const exe = firstExisting(candidates);
    if (exe) {
      await runDetached(exe, []);
      return { ok: true, message: "Abrí WhatsApp." };
    }
    try {
      await runShell(`Start-Process "${WHATSAPP_STORE_APP}"`);
      return { ok: true, message: "Abrí WhatsApp." };
    } catch {
      await openUrl("https://web.whatsapp.com");
      return { ok: true, message: "Abrí WhatsApp Web." };
    }
  }

  if (key === "opera") {
    try {
      await runShell('Start-Process "opera"');
      return { ok: true, message: "Abrí Opera." };
    } catch {
      const exe = firstExisting(candidates);
      if (exe) {
        await runDetached(exe, []);
        return { ok: true, message: "Abrí Opera." };
      }
    }
  }

  const exe = firstExisting(candidates);
  if (exe) {
    await runDetached(exe, []);
    return { ok: true, message: `Abrí ${key}.` };
  }

  // Apps del sistema en PATH (calc, notepad, etc.)
  const pathLaunch = {
    calculator: "calc.exe",
    notepad: "notepad.exe",
    explorer: "explorer.exe",
    cmd: "cmd.exe",
    powershell: "powershell.exe"
  };

  try {
    const launchName = pathLaunch[key] || candidates[0] || key;
    await runShell(`Start-Process ${psQuote(launchName)}`);
    return { ok: true, message: `Abrí ${key}.` };
  } catch {
    return { ok: false, message: `No pude abrir ${key}.` };
  }
}

async function openUrl(url) {
  const safe = String(url || "").trim();
  if (!/^https?:\/\//i.test(safe)) {
    return { ok: false, message: "URL inválida." };
  }
  await runShell(`Start-Process ${psQuote(safe)}`);
  return { ok: true, message: "Abrí el enlace." };
}

async function openPath(targetPath) {
  const safe = String(targetPath || "").trim();
  if (!safe || !fs.existsSync(safe)) {
    return { ok: false, message: "No encontré esa ruta." };
  }
  await runShell(`Start-Process ${psQuote(safe)}`);
  return { ok: true, message: "Listo, abrí la ruta." };
}

async function searchWeb(query, { browser, type } = {}) {
  const q = String(query || "").trim();
  if (!q) return { ok: false, message: "¿Qué busco?" };
  void browser;
  const encoded = encodeURIComponent(q);
  const kind = String(type || "web").toLowerCase();
  const urls = {
    web: `https://www.google.com/search?q=${encoded}`,
    images: `https://www.google.com/search?tbm=isch&q=${encoded}`,
    videos: `https://www.google.com/search?tbm=vid&q=${encoded}`,
    news: `https://www.google.com/search?tbm=nws&q=${encoded}`,
    shopping: `https://www.google.com/search?tbm=shop&q=${encoded}`,
    maps: `https://www.google.com/maps/search/?api=1&query=${encoded}`,
    scholar: `https://scholar.google.com/scholar?q=${encoded}`,
    duck: `https://duckduckgo.com/?q=${encoded}`
  };
  const url = urls[kind] || urls.web;
  return openUrl(url).then((r) => ({
    ok: r.ok,
    message: r.ok ? `Busqué ${q}.` : r.message
  }));
}

/**
 * WhatsApp está en ./whatsapp.js (evita dependencia circular).
 */

async function setVolume({ level, mute, delta } = {}) {
  if (typeof mute === "boolean") {
    await runShell(`(New-Object -ComObject WScript.Shell).SendKeys([char]173)`);
    return {
      ok: true,
      message: mute ? "Silencio activado." : "Cambié el silencio."
    };
  }

  if (typeof delta === "number") {
    const key = delta < 0 ? "[char]174" : "[char]175";
    const times = Math.min(20, Math.ceil(Math.abs(delta) / 2));
    await runShell(
      `$w = New-Object -ComObject WScript.Shell; 1..${times} | ForEach-Object { $w.SendKeys(${key}); Start-Sleep -Milliseconds 40 }`
    );
    return { ok: true, message: delta < 0 ? "Bajé el volumen." : "Subí el volumen." };
  }

  if (typeof level === "number") {
    const steps = Math.max(0, Math.min(50, Math.round(Number(level) / 2)));
    await runShell(
      `$w = New-Object -ComObject WScript.Shell; 1..50 | ForEach-Object { $w.SendKeys([char]174); Start-Sleep -Milliseconds 15 }; 1..${steps} | ForEach-Object { $w.SendKeys([char]175); Start-Sleep -Milliseconds 15 }`
    );
    return { ok: true, message: `Volumen aproximado a ${Math.round(level)}%.` };
  }

  return { ok: false, message: "No entendí el ajuste de volumen." };
}

async function lockPc() {
  await runShell("rundll32.exe user32.dll,LockWorkStation");
  return { ok: true, message: "Bloqueé la sesión." };
}

async function sleepPc() {
  await runShell(
    "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Application]::SetSuspendState('Suspend',$false,$false)"
  );
  return { ok: true, message: "Suspendiendo la PC." };
}

async function screenshot() {
  const out = path.join(os.homedir(), "Pictures", `jarvis-${Date.now()}.png`);
  const dir = path.dirname(out);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  await runShell(`
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$bmp.Save(${psQuote(out)})
$g.Dispose(); $bmp.Dispose()
`);
  return { ok: true, message: `Captura guardada en ${out}`, path: out };
}

function tellTime() {
  const clock = new Date().toLocaleTimeString("es-GT", {
    hour: "2-digit",
    minute: "2-digit"
  });
  return { ok: true, message: `Son las ${clock}.` };
}

function tellDate() {
  const date = new Date().toLocaleDateString("es-GT", { dateStyle: "full" });
  return { ok: true, message: `Hoy es ${date}.` };
}

async function searchYoutube(query) {
  const q = String(query || "").trim();
  if (!q) return openUrl("https://www.youtube.com");
  return openUrl(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`);
}

async function openFolder(name) {
  const key = String(name || "").toLowerCase().trim();
  const map = {
    desktop: path.join(os.homedir(), "Desktop"),
    escritorio: path.join(os.homedir(), "Desktop"),
    downloads: path.join(os.homedir(), "Downloads"),
    descargas: path.join(os.homedir(), "Downloads"),
    documents: path.join(os.homedir(), "Documents"),
    documentos: path.join(os.homedir(), "Documents"),
    pictures: path.join(os.homedir(), "Pictures"),
    imagenes: path.join(os.homedir(), "Pictures"),
    music: path.join(os.homedir(), "Music"),
    musica: path.join(os.homedir(), "Music"),
    videos: path.join(os.homedir(), "Videos"),
    home: os.homedir(),
    jarvis: path.join("C:", "Git", "Personal", "Jarvis")
  };
  const target = map[key];
  if (!target) return { ok: false, message: "No conozco esa carpeta." };
  return openPath(target);
}

async function getWeather(city = "Guatemala") {
  const place = encodeURIComponent(String(city || "Guatemala").trim() || "Guatemala");
  try {
    const res = await fetch(`https://wttr.in/${place}?format=j1`, {
      headers: { "User-Agent": "Jarvis/1.0" }
    });
    if (!res.ok) throw new Error(`wttr ${res.status}`);
    const data = await res.json();
    const current = data.current_condition?.[0];
    const area = data.nearest_area?.[0]?.areaName?.[0]?.value || city;
    const temp = current?.temp_C;
    const desc = current?.lang_es?.[0]?.value || current?.weatherDesc?.[0]?.value || "";
    const feels = current?.FeelsLikeC;
    return {
      ok: true,
      message: `En ${area} hay ${desc.toLowerCase()}, ${temp} grados, sensación de ${feels}.`
    };
  } catch {
    return openUrl(`https://wttr.in/${place}`).then(() => ({
      ok: true,
      message: `Abrí el clima de ${city}.`
    }));
  }
}

async function batteryStatus() {
  try {
    const raw = await runShell(
      `(Get-CimInstance Win32_Battery | Select-Object -First 1 | ForEach-Object { \"$($_.EstimatedChargeRemaining)|$($_.BatteryStatus)\" })`
    );
    if (!raw) return { ok: true, message: "No detecté batería, talvez estás en escritorio." };
    const [pct, status] = raw.split("|");
    const charging = Number(status) === 2 ? "cargando" : "en batería";
    return { ok: true, message: `Batería al ${pct} por ciento, ${charging}.` };
  } catch {
    return { ok: false, message: "No pude leer la batería." };
  }
}

async function systemStatus() {
  try {
    const raw = await runShell(`
$os = Get-CimInstance Win32_OperatingSystem
$free = [math]::Round($os.FreePhysicalMemory/1MB,1)
$total = [math]::Round($os.TotalVisibleMemorySize/1MB,1)
$cpu = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
\"$cpu|$free|$total\"
`);
    const [cpu, free, total] = raw.split("|");
    return {
      ok: true,
      message: `CPU al ${Math.round(Number(cpu) || 0)} por ciento. Memoria libre ${free} de ${total} GB.`
    };
  } catch {
    return { ok: false, message: "No pude leer el estado del sistema." };
  }
}

async function saveNote(text) {
  const note = String(text || "").trim();
  if (!note) return { ok: false, message: "¿Qué anoto?" };
  const file = path.join(os.homedir(), "Documents", "Jarvis-Notas.txt");
  const line = `[${new Date().toLocaleString("es-GT")}] ${note}\n`;
  fs.appendFileSync(file, line, "utf8");
  return { ok: true, message: "Anotado en tus documentos.", path: file };
}

async function readClipboard() {
  try {
    const text = await runShell(
      "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::GetText()"
    );
    if (!text) return { ok: true, message: "El portapapeles está vacío." };
    const short = text.slice(0, 180);
    return { ok: true, message: `En el portapapeles dice: ${short}` };
  } catch {
    return { ok: false, message: "No pude leer el portapapeles." };
  }
}

async function typeText(text) {
  const value = String(text || "").trim();
  if (!value) return { ok: false, message: "¿Qué escribo?" };
  await sleep(400);
  await pasteText(value, { enter: false });
  return { ok: true, message: "Ya lo escribí." };
}

async function emptyRecycleBin() {
  await runShell(
    "Clear-RecycleBin -Force -ErrorAction SilentlyContinue; if (-not $?) { (New-Object -ComObject Shell.Application).NameSpace(0xA).Items() | ForEach-Object { Remove-Item $_.Path -Recurse -Force -ErrorAction SilentlyContinue } }"
  );
  return { ok: true, message: "Vaciar papelera listo." };
}

function tellJoke() {
  const jokes = [
    "¿Por qué el computador fue al médico? Porque tenía un virus.",
    "No soy perezoso, estoy en modo ahorro de energía.",
    "Probé ser normal una vez. Los permisos de administrador me lo negaron.",
    "Mi código funciona... no sé por qué, pero funciona.",
    "Si la vida te da limones, pídele a Jarvis que busque la receta."
  ];
  return { ok: true, message: jokes[Math.floor(Math.random() * jokes.length)] };
}

module.exports = {
  openApp,
  openUrl,
  openPath,
  searchWeb,
  searchYoutube,
  openFolder,
  setVolume,
  lockPc,
  sleepPc,
  screenshot,
  tellTime,
  tellDate,
  getWeather,
  batteryStatus,
  systemStatus,
  saveNote,
  readClipboard,
  typeText,
  emptyRecycleBin,
  tellJoke,
  runShell,
  pasteText,
  sleep,
  APP_MAP
};
