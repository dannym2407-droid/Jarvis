const os = require("node:os");
const fs = require("node:fs");
const path = require("node:path");
const { runShell } = require("../actions/system");
const { loadProjectsFile, resolveProjectPath, upsertProject } = require("../memory/store");
const { gitStatus, pickRepo } = require("../actions/git");
const { config } = require("../config");

async function foregroundWindow() {
  try {
    const out = await runShell(`
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class JarvisFg {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
}
"@
$h = [JarvisFg]::GetForegroundWindow()
$sb = New-Object System.Text.StringBuilder 512
[void][JarvisFg]::GetWindowText($h, $sb, $sb.Capacity)
$pidOut = 0
[void][JarvisFg]::GetWindowThreadProcessId($h, [ref]$pidOut)
$proc = Get-Process -Id $pidOut -ErrorAction SilentlyContinue
"{0}|||{1}|||{2}" -f $sb.ToString(), $proc.ProcessName, $pidOut
`);
    const [title, processName, pid] = String(out || "").trim().split("|||");
    return { title: title || "", processName: processName || "", pid: Number(pid) || 0 };
  } catch {
    return { title: "", processName: "", pid: 0 };
  }
}

async function topMemoryApps(limit = 6) {
  try {
    const out = await runShell(`
Get-Process | Where-Object { $_.WorkingSet64 -gt 80MB } |
  Sort-Object WorkingSet64 -Descending |
  Select-Object -First ${limit} Name,@{N='MB';E={[math]::Round($_.WorkingSet64/1MB,0)}} |
  ForEach-Object { "$($_.Name)=$($_.MB)" }
`);
    return String(out || "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [name, mb] = l.split("=");
        return { name, mb: Number(mb) || 0 };
      });
  } catch {
    return [];
  }
}

async function resourceSnapshot() {
  try {
    const out = await runShell(`
$os = Get-CimInstance Win32_OperatingSystem
$total = [math]::Round($os.TotalVisibleMemorySize/1MB,1)
$free = [math]::Round($os.FreePhysicalMemory/1MB,1)
$used = [math]::Round($total-$free,1)
$ram = [math]::Round(($used/$total)*100,0)
$cpu = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
$disk = Get-PSDrive C | ForEach-Object { [math]::Round(($_.Used/($_.Used+$_.Free))*100,0) }
"$cpu|$ram|$used|$total|$disk"
`);
    const [cpu, ram, used, total, disk] = String(out || "").trim().split("|").map(Number);
    return {
      cpu: cpu || 0,
      ram: ram || 0,
      ramUsedGb: used || 0,
      ramTotalGb: total || 0,
      disk: disk || 0
    };
  } catch {
    return { cpu: 0, ram: 0, ramUsedGb: 0, ramTotalGb: 0, disk: 0 };
  }
}

async function runningDevSignals() {
  try {
    const out = await runShell(`
$names = @('node','Code','Cursor','chrome','msedge','docker','com.docker','postgres','mongod','python','Idle')
Get-Process | Where-Object { $names -contains $_.ProcessName } |
  Select-Object -ExpandProperty ProcessName -Unique
`);
    const procs = new Set(
      String(out || "")
        .split(/\r?\n/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    );
    return {
      backendNode: procs.has("node"),
      vscode: procs.has("code"),
      cursor: procs.has("cursor"),
      chrome: procs.has("chrome") || procs.has("msedge"),
      docker: [...procs].some((p) => p.includes("docker")),
      database: procs.has("postgres") || procs.has("mongod"),
      processes: [...procs]
    };
  } catch {
    return {
      backendNode: false,
      vscode: false,
      cursor: false,
      chrome: false,
      docker: false,
      database: false,
      processes: []
    };
  }
}

function detectActiveProjectFromTitle(title) {
  const t = String(title || "");
  const map = loadProjectsFile();
  for (const name of Object.keys(map)) {
    if (t.toLowerCase().includes(name.toLowerCase())) return name;
  }
  // Cursor/VS Code titles often: "file — project (Workspace)"
  const m = t.match(/[—\-–]\s*([^—\-–]+?)(?:\s*\(|$)/);
  if (m) return m[1].trim();
  return null;
}

async function workspaceBrief() {
  const [fg, resources, apps, signals] = await Promise.all([
    foregroundWindow(),
    resourceSnapshot(),
    topMemoryApps(5),
    runningDevSignals()
  ]);

  const projectName = detectActiveProjectFromTitle(fg.title);
  let project = projectName ? resolveProjectPath(projectName) : null;
  if (!project && /cursor|code|visual studio/i.test(fg.processName + fg.title)) {
    project = pickRepo("jarvis");
  }

  let git = null;
  if (project?.path) {
    git = await gitStatus(project.path);
    upsertProject(project.name, { path: project.path, lastSeen: new Date().toISOString() });
  }

  return {
    foreground: fg,
    resources,
    topApps: apps,
    signals,
    project,
    git,
    at: new Date().toISOString()
  };
}

async function diagnoseWhyBroken() {
  const brief = await workspaceBrief();
  const clues = [];

  clues.push(`App en foco: ${brief.foreground.processName || "desconocida"} — ${brief.foreground.title || "sin título"}`);
  if (brief.project) clues.push(`Proyecto probable: ${brief.project.name} (${brief.project.path})`);
  if (brief.git?.dirty) clues.push(`Git sucio: ${brief.git.files?.slice(0, 5).join(", ") || "cambios"}`);
  if (brief.git && !brief.git.dirty && brief.git.ok) clues.push("Git limpio.");

  const s = brief.signals;
  clues.push(
    `Servicios: node=${s.backendNode ? "ON" : "OFF"}, Cursor=${s.cursor ? "ON" : "OFF"}, VSCode=${s.vscode ? "ON" : "OFF"}, browser=${s.chrome ? "ON" : "OFF"}, docker=${s.docker ? "ON" : "OFF"}`
  );

  if (brief.resources.ram >= 85) {
    clues.push(`RAM alta ${brief.resources.ram}%. Top: ${brief.topApps.map((a) => `${a.name} ${a.mb}MB`).join(", ")}`);
  }

  // Heurística puertos: leer package.json scripts si hay proyecto
  let portHint = "";
  try {
    const pkgPath = brief.project?.path ? path.join(brief.project.path, "package.json") : "";
    if (pkgPath && fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      const scripts = JSON.stringify(pkg.scripts || {});
      const ports = [...scripts.matchAll(/(\d{4})/g)].map((m) => m[1]);
      if (ports.length) portHint = `Scripts mencionan puertos: ${[...new Set(ports)].slice(0, 6).join(", ")}.`;
    }
  } catch {
    // ignore
  }
  if (portHint) clues.push(portHint);

  // Listen ports
  try {
    const portsOut = await runShell(`
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $_.LocalPort -in 3000,3001,4000,5000,5173,8000,8080,8787 } |
  Select-Object -ExpandProperty LocalPort -Unique
`);
    const listening = String(portsOut || "")
      .split(/\r?\n/)
      .map((x) => x.trim())
      .filter(Boolean);
    if (listening.length) clues.push(`Puertos escuchando: ${listening.join(", ")}`);
    else clues.push("No vi puertos típicos de dev escuchando (3000/5000/5173/...).");
  } catch {
    // ignore
  }

  const message = `Diagnóstico rápido: ${clues.join(" · ")}`;
  return { ok: true, message: message.slice(0, 900), brief };
}

async function radarPayload() {
  const brief = await workspaceBrief();
  return {
    ok: true,
    cpu: brief.resources.cpu,
    ram: brief.resources.ram,
    disk: brief.resources.disk,
    ramDetail: `${brief.resources.ramUsedGb}/${brief.resources.ramTotalGb} GB`,
    project: brief.project?.name || detectActiveProjectFromTitle(brief.foreground.title) || "—",
    foreground: brief.foreground.title || brief.foreground.processName || "—",
    services: {
      backend: brief.signals.backendNode,
      frontend: brief.signals.chrome,
      cursor: brief.signals.cursor,
      vscode: brief.signals.vscode,
      docker: brief.signals.docker,
      database: brief.signals.database
    },
    topApps: brief.topApps,
    git: brief.git
      ? { dirty: brief.git.dirty, branch: brief.git.branch, files: brief.git.files || [] }
      : null,
    host: os.hostname(),
    user: config.userName,
    at: brief.at
  };
}

module.exports = {
  foregroundWindow,
  topMemoryApps,
  resourceSnapshot,
  runningDevSignals,
  workspaceBrief,
  diagnoseWhyBroken,
  radarPayload
};
