const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { runShell, openUrl, openPath, pasteText } = require("./system");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function psQuote(text) {
  return `'${String(text).replace(/'/g, "''")}'`;
}

function safeUnderHome(target) {
  const home = os.homedir();
  const resolved = path.resolve(String(target || "").replace(/^~(?=$|[/\\])/, home));
  const homeNorm = path.resolve(home).toLowerCase();
  if (!resolved.toLowerCase().startsWith(homeNorm)) {
    return null;
  }
  return resolved;
}

async function launchAny(name) {
  const n = String(name || "").trim();
  if (!n) return { ok: false, message: "¿Qué lanzo?" };

  if (/^https?:\/\//i.test(n)) {
    return openUrl(n);
  }

  // 1) Start-Process directo
  try {
    await runShell(`Start-Process ${psQuote(n)}`);
    return { ok: true, message: `Abrí ${n}.` };
  } catch {
    // continue
  }

  // 2) cmd start (abre apps del menú Inicio por nombre)
  try {
    await runShell(`cmd /c start "" ${psQuote(n)}`);
    return { ok: true, message: `Lancé ${n}.` };
  } catch {
    // continue
  }

  // 3) Buscar .exe en Program Files / LocalAppData
  try {
    const script = `
$ErrorActionPreference='SilentlyContinue'
$q = ${psQuote(n)}
$roots = @(
  "$env:LOCALAPPDATA\\Programs",
  "$env:LOCALAPPDATA",
  "$env:ProgramFiles",
  ${psQuote(process.env["ProgramFiles(x86)"] || "")},
  "$env:APPDATA"
) | Where-Object { $_ -and (Test-Path $_) }
foreach ($r in $roots) {
  $hit = Get-ChildItem -Path $r -Recurse -Filter ($q + '*.exe') -Depth 3 | Select-Object -First 1
  if ($hit) { $hit.FullName; break }
  $hit2 = Get-ChildItem -Path $r -Recurse -Filter '*.exe' -Depth 3 | Where-Object { $_.BaseName -like ('*'+$q+'*') } | Select-Object -First 1
  if ($hit2) { $hit2.FullName; break }
}
`;
    const found = String(await runShell(script)).trim().split(/\r?\n/).filter(Boolean)[0];
    if (found && fs.existsSync(found)) {
      await openPath(found);
      return { ok: true, message: `Abrí ${path.basename(found)}.` };
    }
  } catch {
    // continue
  }

  return { ok: false, message: `No encontré cómo abrir "${n}".` };
}

async function hotkey(keys) {
  const seq = String(keys || "").trim();
  if (!seq) return { ok: false, message: "¿Qué teclas?" };
  // Ejemplos: ^s (Ctrl+S), %{F4} (Alt+F4), ^c, #e (Win+E)
  await runShell(`(New-Object -ComObject WScript.Shell).SendKeys(${psQuote(seq)})`);
  return { ok: true, message: "Teclas enviadas." };
}

async function writeFileSafe({ filePath, content } = {}) {
  const safe = safeUnderHome(filePath);
  if (!safe) return { ok: false, message: "Solo puedo escribir dentro de tu carpeta de usuario." };
  fs.mkdirSync(path.dirname(safe), { recursive: true });
  fs.writeFileSync(safe, String(content ?? ""), "utf8");
  return { ok: true, message: `Guardé ${path.basename(safe)}.` };
}

async function readFileSafe({ filePath } = {}) {
  const safe = safeUnderHome(filePath);
  if (!safe || !fs.existsSync(safe)) {
    return { ok: false, message: "No encontré ese archivo en tu usuario." };
  }
  const text = fs.readFileSync(safe, "utf8").slice(0, 1200);
  return { ok: true, message: text || "(archivo vacío)" };
}

async function listDirSafe({ dirPath } = {}) {
  const base = dirPath ? safeUnderHome(dirPath) : os.homedir();
  if (!base || !fs.existsSync(base)) {
    return { ok: false, message: "Carpeta no válida." };
  }
  const entries = fs.readdirSync(base).slice(0, 20);
  return {
    ok: true,
    message: entries.length ? `En ${path.basename(base)}: ${entries.join(", ")}.` : "Carpeta vacía."
  };
}

async function typeAndEnter(text) {
  const t = String(text || "");
  if (!t) return { ok: false, message: "¿Qué escribo?" };
  await pasteText(t, { enter: true });
  return { ok: true, message: "Escribí y di Enter." };
}

async function searchEverything(query) {
  const q = String(query || "").trim();
  if (!q) return { ok: false, message: "¿Qué busco?" };
  // Win+S y escribe
  await runShell(`(New-Object -ComObject WScript.Shell).SendKeys('^{esc}')`);
  await sleep(450);
  await pasteText(q, { enter: true, delayMs: 200 });
  return { ok: true, message: `Busqué "${q}" en el menú Inicio.` };
}

async function openDesktopFile(name) {
  const n = String(name || "").trim();
  const desktop = path.join(os.homedir(), "Desktop");
  if (!fs.existsSync(desktop)) return { ok: false, message: "No hay escritorio." };
  const files = fs.readdirSync(desktop);
  const hit = files.find((f) => f.toLowerCase().includes(n.toLowerCase()));
  if (!hit) return { ok: false, message: `No vi "${n}" en el escritorio.` };
  await openPath(path.join(desktop, hit));
  return { ok: true, message: `Abrí ${hit}.` };
}

async function createNoteOnDesktop({ title, content } = {}) {
  const safeTitle = String(title || "nota-jarvis")
    .replace(/[<>:"/\\|?*]/g, "")
    .slice(0, 40) || "nota-jarvis";
  const file = path.join(os.homedir(), "Desktop", `${safeTitle}.txt`);
  fs.writeFileSync(file, String(content || ""), "utf8");
  await openPath(file);
  return { ok: true, message: `Creé ${safeTitle}.txt en el escritorio.` };
}

async function multiRun(steps, runAction) {
  const list = Array.isArray(steps) ? steps.slice(0, 8) : [];
  const results = [];
  for (const step of list) {
    const action = step?.action || "none";
    if (action === "multi") continue;
    const args = step?.args || {};
    // eslint-disable-next-line no-await-in-loop
    const r = await runAction(action, args);
    results.push({ action, ok: r?.ok !== false, message: r?.message || "" });
    // eslint-disable-next-line no-await-in-loop
    await sleep(350);
  }
  const failed = results.filter((r) => !r.ok);
  if (failed.length && failed.length === results.length) {
    return { ok: false, message: failed[0].message || "Fallaron los pasos." };
  }
  const lastMsg = results.map((r) => r.message).filter(Boolean).slice(-2).join(" ");
  return { ok: true, message: lastMsg || `Hice ${results.length} pasos.`, results };
}

module.exports = {
  launchAny,
  hotkey,
  writeFileSafe,
  readFileSafe,
  listDirSafe,
  typeAndEnter,
  searchEverything,
  openDesktopFile,
  createNoteOnDesktop,
  multiRun
};
