const fs = require("node:fs");
const path = require("node:path");
const { config } = require("../config");

const MEMORY_FILE = path.join(config.root, "data", "memory.json");
const PROJECTS_FILE = path.join(config.root, "data", "projects.json");

function emptyMemory() {
  return {
    version: 2,
    user: {
      preferences: [],
      habits: [],
      commands: []
    },
    projects: {},
    code: {
      repos: [],
      technologies: [],
      knownErrors: []
    },
    history: {
      decisions: [],
      tasks: [],
      solved: []
    },
    facts: []
  };
}

function loadMemory() {
  try {
    if (!fs.existsSync(MEMORY_FILE)) return emptyMemory();
    const raw = JSON.parse(fs.readFileSync(MEMORY_FILE, "utf8"));
    if (Array.isArray(raw)) {
      const mem = emptyMemory();
      mem.facts = raw.slice(-50);
      saveMemory(mem);
      return mem;
    }
    return { ...emptyMemory(), ...raw, user: { ...emptyMemory().user, ...(raw.user || {}) } };
  } catch {
    return emptyMemory();
  }
}

function saveMemory(mem) {
  fs.mkdirSync(path.dirname(MEMORY_FILE), { recursive: true });
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(mem, null, 2), "utf8");
}

function pushCapped(arr, item, max = 40) {
  arr.push(item);
  if (arr.length > max) arr.splice(0, arr.length - max);
}

function rememberFact(text, bucket = "facts") {
  const mem = loadMemory();
  const entry = { at: new Date().toISOString(), text: String(text || "").trim() };
  if (bucket === "preference") pushCapped(mem.user.preferences, entry);
  else if (bucket === "habit") pushCapped(mem.user.habits, entry);
  else if (bucket === "decision") pushCapped(mem.history.decisions, entry);
  else if (bucket === "task") pushCapped(mem.history.tasks, entry);
  else if (bucket === "solved") pushCapped(mem.history.solved, entry);
  else if (bucket === "error") pushCapped(mem.code.knownErrors, entry);
  else pushCapped(mem.facts, entry);
  saveMemory(mem);
  return entry;
}

function recallSummary() {
  const mem = loadMemory();
  const bits = [];
  const prefs = mem.user.preferences.slice(-2).map((x) => x.text);
  const facts = mem.facts.slice(-3).map((x) => x.text);
  const tasks = mem.history.tasks.filter((t) => !t.done).slice(-3).map((x) => x.text);
  if (prefs.length) bits.push(`Preferencias: ${prefs.join("; ")}`);
  if (facts.length) bits.push(`Hechos: ${facts.join("; ")}`);
  if (tasks.length) bits.push(`Tareas: ${tasks.join("; ")}`);
  const projects = Object.keys(mem.projects || {});
  if (projects.length) bits.push(`Proyectos: ${projects.join(", ")}`);
  return bits.length ? bits.join(". ") : "Aún no tengo memoria estructurada.";
}

function upsertProject(name, data = {}) {
  const mem = loadMemory();
  const key = String(name || "").trim();
  if (!key) return null;
  mem.projects[key] = {
    ...(mem.projects[key] || {}),
    ...data,
    updatedAt: new Date().toISOString()
  };
  saveMemory(mem);
  return mem.projects[key];
}

function loadProjectsFile() {
  try {
    if (!fs.existsSync(PROJECTS_FILE)) {
      const starter = {
        Jarvis: config.root,
        // Agrega más: "Portfolio": "C:\\\\Git\\\\Personal\\\\Portfolio"
      };
      fs.mkdirSync(path.dirname(PROJECTS_FILE), { recursive: true });
      fs.writeFileSync(PROJECTS_FILE, JSON.stringify(starter, null, 2), "utf8");
      return starter;
    }
    return JSON.parse(fs.readFileSync(PROJECTS_FILE, "utf8")) || {};
  } catch {
    return { Jarvis: config.root };
  }
}

function resolveProjectPath(name) {
  const q = String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim();
  const map = loadProjectsFile();
  const mem = loadMemory();

  for (const [key, val] of Object.entries(map)) {
    const k = key.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
    if (q.includes(k) || k.includes(q)) {
      const p = typeof val === "string" ? val : val?.path;
      if (p && fs.existsSync(p)) return { name: key, path: p };
    }
  }

  for (const [key, val] of Object.entries(mem.projects || {})) {
    const k = key.toLowerCase();
    if ((q.includes(k) || k.includes(q)) && val.path && fs.existsSync(val.path)) {
      return { name: key, path: val.path };
    }
  }

  // env PROJECT_*
  for (const [envKey, envVal] of Object.entries(process.env)) {
    if (!/^PROJECT_/i.test(envKey) || !envVal) continue;
    const label = envKey.replace(/^PROJECT_/i, "").toLowerCase().replace(/_/g, " ");
    if (q.includes(label) || label.includes(q)) {
      if (fs.existsSync(envVal)) return { name: label, path: envVal };
    }
  }

  if (fs.existsSync(config.root) && (/jarvis|este proyecto|aqui|aquí/.test(q) || !q)) {
    return { name: "Jarvis", path: config.root };
  }
  return null;
}

function memoryContextForAi() {
  const mem = loadMemory();
  const projects = loadProjectsFile();
  return {
    preferences: mem.user.preferences.slice(-5).map((x) => x.text),
    facts: mem.facts.slice(-5).map((x) => x.text),
    knownErrors: mem.code.knownErrors.slice(-5).map((x) => x.text),
    projectNames: Object.keys(projects),
    openTasks: mem.history.tasks.filter((t) => !t.done).slice(-5).map((x) => x.text)
  };
}

module.exports = {
  loadMemory,
  saveMemory,
  rememberFact,
  recallSummary,
  upsertProject,
  loadProjectsFile,
  resolveProjectPath,
  memoryContextForAi,
  MEMORY_FILE,
  PROJECTS_FILE
};
