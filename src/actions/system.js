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
  spotify: [
    path.join(os.homedir(), "AppData\\Roaming\\Spotify\\Spotify.exe"),
    "C:\\Program Files\\WindowsApps\\Spotify*"
  ],
  discord: [path.join(os.homedir(), "AppData\\Local\\Discord\\Update.exe")],
  vscode: [
    path.join(os.homedir(), "AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe"),
    "C:\\Program Files\\Microsoft VS Code\\Code.exe",
    path.join(os.homedir(), "AppData\\Local\\Programs\\cursor\\Cursor.exe")
  ],
  cursor: [path.join(os.homedir(), "AppData\\Local\\Programs\\cursor\\Cursor.exe")],
  calculator: ["calc.exe"],
  cmd: ["cmd.exe"],
  powershell: ["powershell.exe"],
  settings: ["ms-settings:"]
};

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
    const child = spawn("powershell.exe", ["-NoProfile", "-Command", command], {
      windowsHide: true
    });
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

async function openApp(name) {
  const key = String(name || "").toLowerCase().trim();
  const candidates = APP_MAP[key];
  if (!candidates) {
    return { ok: false, message: `No conozco la app "${name}".` };
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

  const exe = firstExisting(candidates);
  if (exe) {
    await runDetached(exe, []);
    return { ok: true, message: `Abrí ${key}.` };
  }

  // Fallback: Start-Process por nombre
  try {
    await runShell(`Start-Process "${key}"`);
    return { ok: true, message: `Intenté abrir ${key}.` };
  } catch {
    return { ok: false, message: `No pude abrir ${key}.` };
  }
}

async function openUrl(url) {
  const safe = String(url || "").trim();
  if (!/^https?:\/\//i.test(safe)) {
    return { ok: false, message: "URL inválida." };
  }
  await runShell(`Start-Process "${safe.replace(/"/g, "")}"`);
  return { ok: true, message: "Abrí el enlace." };
}

async function openPath(targetPath) {
  const safe = String(targetPath || "").trim();
  if (!safe || !fs.existsSync(safe)) {
    return { ok: false, message: "No encontré esa ruta." };
  }
  await runShell(`Start-Process "${safe.replace(/"/g, '`"')}"`);
  return { ok: true, message: "Listo, abrí la ruta." };
}

async function searchWeb(query) {
  const q = encodeURIComponent(String(query || "").trim());
  if (!q) return { ok: false, message: "¿Qué busco?" };
  return openUrl(`https://www.google.com/search?q=${q}`);
}

async function setVolume({ level, mute, delta } = {}) {
  if (typeof mute === "boolean") {
    const flag = mute ? 1 : 0;
    await runShell(`(New-Object -ComObject WScript.Shell).SendKeys([char]173)`);
    // Toggle mute is unreliable twice; use nircmd-free approach via AudioDeviceCmdlets not available.
    // Prefer key simulation only when mute requested:
    void flag;
    return { ok: true, message: mute ? "Silencio activado (tecla mute)." : "Intenté quitar silencio (tecla mute)." };
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
    // Approximate: mute-ish reset then raise. Without paid libs we approximate with key presses.
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
  await runShell("Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Application]::SetSuspendState('Suspend',$false,$false)");
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
$bmp.Save('${out.replace(/'/g, "''")}')
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

module.exports = {
  openApp,
  openUrl,
  openPath,
  searchWeb,
  setVolume,
  lockPc,
  sleepPc,
  screenshot,
  tellTime,
  tellDate,
  runShell
};
