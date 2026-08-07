const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { runShell } = require("./system");
const { resolveProjectPath } = require("../memory/store");
const { askGroq } = require("../ai");

const CAPTURE_FILE = path.join(os.homedir(), ".jarvis-terminal-capture.txt");

function looksLikeError(text) {
  const t = String(text || "");
  if (t.length < 8) return false;
  return /(error|exception|failed|fatal|traceback|enoent|eaddrinuse|cannot|undefined|null reference|syntaxerror|typeerror|errno|npm err|el sistema no puede|no se reconoce|denied|crash)/i.test(
    t
  );
}

async function readCaptureFile() {
  try {
    if (!fs.existsSync(CAPTURE_FILE)) return "";
    const stat = fs.statSync(CAPTURE_FILE);
    // solo si es reciente (< 30 min)
    if (Date.now() - stat.mtimeMs > 30 * 60 * 1000) return "";
    return fs.readFileSync(CAPTURE_FILE, "utf8").slice(-6000);
  } catch {
    return "";
  }
}

function findRecentLogs(projectPath, limit = 3) {
  if (!projectPath || !fs.existsSync(projectPath)) return [];
  const candidates = [];
  const roots = [
    projectPath,
    path.join(projectPath, "logs"),
    path.join(projectPath, ".next"),
    path.join(projectPath, "tmp"),
    path.join(os.homedir(), "AppData", "Local", "Temp")
  ];

  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    try {
      const entries = fs.readdirSync(root, { withFileTypes: true });
      for (const ent of entries) {
        if (!ent.isFile()) continue;
        if (!/\.(log|txt|err)$/i.test(ent.name) && !/npm-debug|yarn-error|debug/i.test(ent.name)) {
          continue;
        }
        const full = path.join(root, ent.name);
        try {
          const st = fs.statSync(full);
          if (Date.now() - st.mtimeMs > 2 * 60 * 60 * 1000) continue;
          if (st.size > 2_000_000) continue;
          candidates.push({ path: full, mtime: st.mtimeMs });
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }
  }

  return candidates
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, limit)
    .map((c) => {
      try {
        const text = fs.readFileSync(c.path, "utf8").slice(-4000);
        return { file: c.path, text };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

async function grabActiveConsoleText() {
  // Intenta leer texto de ventanas tipo consola (mejor esfuerzo en Windows)
  try {
    const out = await runShell(`
$ErrorActionPreference='SilentlyContinue'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$root = [System.Windows.Automation.AutomationElement]::RootElement
$cond = New-Object System.Windows.Automation.PropertyCondition(
  [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
  [System.Windows.Automation.ControlType]::Window
)
$windows = $root.FindAll([System.Windows.Automation.TreeScope]::Children, $cond)
$prefer = @('Windows Terminal','Terminal','Command Prompt','cmd.exe','PowerShell','Cursor','Visual Studio Code','Code')
foreach ($w in $windows) {
  $name = $w.Current.Name
  if (-not $name) { continue }
  $hit = $false
  foreach ($p in $prefer) { if ($name -like ("*$p*")) { $hit = $true; break } }
  if (-not $hit) { continue }
  $docCond = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::Document
  )
  $doc = $w.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $docCond)
  if ($doc) {
    $tp = $doc.GetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern)
    if ($tp) {
      $t = $tp.DocumentRange.GetText(5000)
      if ($t -and $t.Length -gt 20) { $t; break }
    }
  }
}
`);
    return String(out || "").trim().slice(-5000);
  } catch {
    return "";
  }
}

async function getClipboardRaw() {
  try {
    const text = await runShell(
      "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::GetText()"
    );
    return String(text || "").trim();
  } catch {
    return "";
  }
}

async function collectTerminalContext(projectHint) {
  const sources = [];
  const clip = await getClipboardRaw();
  if (clip && looksLikeError(clip)) {
    sources.push({ from: "portapapeles", text: clip.slice(-4000) });
  } else if (clip && clip.length > 40) {
    sources.push({ from: "portapapeles", text: clip.slice(-3000) });
  }

  const capture = await readCaptureFile();
  if (capture) sources.push({ from: "captura Jarvis", text: capture });

  const consoleText = await grabActiveConsoleText();
  if (consoleText && looksLikeError(consoleText)) {
    sources.push({ from: "ventana consola", text: consoleText });
  }

  const project = resolveProjectPath(projectHint || "") || resolveProjectPath("jarvis");
  if (project?.path) {
    for (const log of findRecentLogs(project.path)) {
      if (looksLikeError(log.text) || log.text.length > 80) {
        sources.push({ from: path.basename(log.file), text: log.text });
      }
    }
  }

  return { sources, project };
}

async function explainTerminal({ project } = {}) {
  const { sources, project: proj } = await collectTerminalContext(project);
  if (!sources.length) {
    return {
      ok: false,
      message:
        "No encontré error en portapapeles, captura ni logs. Copia el error (Ctrl+C) y di: explica el error. O guarda salida en ~/.jarvis-terminal-capture.txt"
    };
  }

  const blob = sources
    .slice(0, 3)
    .map((s) => `[${s.from}]\n${s.text}`)
    .join("\n\n")
    .slice(0, 7000);

  try {
    const plan = await askGroq(
      `Eres Jarvis diagnosticando un error de desarrollo. Proyecto: ${proj?.name || "desconocido"}.
Explica en español, máximo 4 oraciones para voz: qué falló, causa probable, y 1-2 pasos concretos para arreglarlo.
NO JSON largo: responde {"action":"none","args":{},"say":"tu explicación"}.
LOGS:\n${blob}`,
      []
    );
    return {
      ok: true,
      message: plan.say || "Vi el error, pero no pude resumirlo bien.",
      sources: sources.map((s) => s.from)
    };
  } catch (error) {
    // fallback sin IA: primeras líneas útiles
    const rough = sources[0].text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => looksLikeError(l) || /error|fail|exception/i.test(l))
      .slice(0, 3)
      .join(" ");
    return {
      ok: true,
      message: rough
        ? `Esto saltó: ${rough.slice(0, 360)}`
        : `Falló al analizar: ${String(error.message || error).slice(0, 120)}`
    };
  }
}

async function saveTerminalCapture(text) {
  const t = String(text || "").trim();
  if (!t) return { ok: false, message: "Nada que guardar." };
  fs.writeFileSync(CAPTURE_FILE, t, "utf8");
  return { ok: true, message: "Guardé la captura de terminal." };
}

module.exports = {
  explainTerminal,
  collectTerminalContext,
  saveTerminalCapture,
  CAPTURE_FILE,
  looksLikeError
};
