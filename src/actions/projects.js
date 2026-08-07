const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const https = require("node:https");
const net = require("node:net");
const { loadProjectsFile, resolveProjectPath } = require("../memory/store");
const { runShell } = require("./system");

function normalizeProjectEntry(name, val) {
  if (!val) return null;
  if (typeof val === "string") {
    return {
      name,
      path: val,
      ports: [],
      health: [],
      scripts: {},
      branch: null
    };
  }
  return {
    name,
    path: val.path || "",
    ports: Array.isArray(val.ports) ? val.ports : [],
    health: Array.isArray(val.health) ? val.health : [],
    scripts: val.scripts || {},
    branch: val.branch || null,
    stack: val.stack || null
  };
}

function listProjectProfiles() {
  const map = loadProjectsFile();
  return Object.entries(map)
    .map(([name, val]) => normalizeProjectEntry(name, val))
    .filter((p) => p?.path);
}

function getProjectProfile(hint) {
  const resolved = resolveProjectPath(hint || "");
  if (!resolved) return null;
  const map = loadProjectsFile();
  const raw = map[resolved.name];
  return normalizeProjectEntry(resolved.name, raw || resolved.path);
}

function checkPort(port, host = "127.0.0.1", timeoutMs = 700) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      try {
        socket.destroy();
      } catch {
        // ignore
      }
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, host);
  });
}

function checkHttp(url, timeoutMs = 1500) {
  return new Promise((resolve) => {
    try {
      const lib = String(url).startsWith("https") ? https : http;
      const req = lib.get(url, { timeout: timeoutMs }, (res) => {
        res.resume();
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 500, status: res.statusCode });
      });
      req.on("timeout", () => {
        req.destroy();
        resolve({ ok: false, status: 0 });
      });
      req.on("error", () => resolve({ ok: false, status: 0 }));
    } catch {
      resolve({ ok: false, status: 0 });
    }
  });
}

async function healthcheckProject(hint) {
  const profile = getProjectProfile(hint) || listProjectProfiles()[0];
  if (!profile) {
    return { ok: false, message: "No hay proyectos en data/projects.json." };
  }
  if (!fs.existsSync(profile.path)) {
    return { ok: false, message: `La ruta de ${profile.name} no existe: ${profile.path}` };
  }

  // Inferir puertos de package.json si no hay
  let ports = [...profile.ports];
  let health = [...profile.health];
  try {
    const pkgPath = path.join(profile.path, "package.json");
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      const scripts = JSON.stringify(pkg.scripts || {});
      const found = [...scripts.matchAll(/\b(\d{4})\b/g)].map((m) => Number(m[1]));
      for (const p of found) {
        if (p >= 3000 && p <= 9999 && !ports.includes(p)) ports.push(p);
      }
    }
  } catch {
    // ignore
  }
  if (!ports.length) ports = [3000, 5000, 5173, 8787];
  ports = [...new Set(ports)].slice(0, 8);

  if (!health.length) {
    health = ports.map((p) => `http://127.0.0.1:${p}/`);
  }

  const portResults = [];
  for (const port of ports) {
    // eslint-disable-next-line no-await-in-loop
    const open = await checkPort(port);
    portResults.push({ port, open });
  }

  const httpResults = [];
  for (const url of health.slice(0, 6)) {
    // eslint-disable-next-line no-await-in-loop
    const r = await checkHttp(url);
    httpResults.push({ url, ...r });
  }

  const openPorts = portResults.filter((p) => p.open).map((p) => p.port);
  const closedPorts = portResults.filter((p) => !p.open).map((p) => p.port);
  const okHttp = httpResults.filter((h) => h.ok).map((h) => h.url);
  const badHttp = httpResults.filter((h) => !h.ok).map((h) => h.url);

  // Heurística mismatch frontend/backend
  let hintMsg = "";
  if (openPorts.includes(3000) && closedPorts.includes(5000)) {
    hintMsg = " Tip: algo escucha en 3000 pero 5000 está cerrado.";
  } else if (openPorts.includes(5000) && closedPorts.includes(3000)) {
    hintMsg = " Tip: API en 5000 OK, pero 3000 (front típico) está cerrado.";
  }

  const parts = [
    `Health · ${profile.name}`,
    openPorts.length ? `Puertos ON: ${openPorts.join(", ")}` : "Ningún puerto del perfil está ON",
    closedPorts.length ? `OFF: ${closedPorts.join(", ")}` : null,
    okHttp.length ? `HTTP OK: ${okHttp.length}` : null,
    badHttp.length ? `HTTP falló: ${badHttp.slice(0, 2).join(", ")}` : null,
    hintMsg || null
  ].filter(Boolean);

  return {
    ok: true,
    message: parts.join(". ") + ".",
    profile,
    portResults,
    httpResults
  };
}

async function startProjectStack(hint) {
  const profile = getProjectProfile(hint);
  if (!profile?.path) {
    return { ok: false, message: "No encontré ese proyecto en data/projects.json." };
  }
  const startCmd = profile.scripts?.start || profile.scripts?.dev;
  if (!startCmd) {
    return {
      ok: false,
      message: `No hay script start/dev en el perfil de ${profile.name}. Agrégalo en projects.json.`
    };
  }
  try {
    await runShell(
      `Start-Process powershell -ArgumentList '-NoExit','-Command','cd ${profile.path.replace(/'/g, "''")}; ${startCmd.replace(/'/g, "''")}'`
    );
    return { ok: true, message: `Lancé ${profile.name}: ${startCmd}` };
  } catch (error) {
    return { ok: false, message: String(error.message || error).slice(0, 160) };
  }
}

module.exports = {
  listProjectProfiles,
  getProjectProfile,
  healthcheckProject,
  startProjectStack,
  normalizeProjectEntry,
  checkPort
};
