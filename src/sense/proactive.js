const { radarPayload, topMemoryApps } = require("./workspace");
const { gitStatus, pickRepo } = require("../actions/git");
const { loadProjectsFile } = require("../memory/store");
const { synthesizeToFile } = require("../voice/tts");
const path = require("node:path");

const listeners = new Set();
const state = {
  lastAlertAt: 0,
  lastAlertKey: "",
  lastSuggestion: null,
  watchingTasks: []
};

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(event) {
  state.lastSuggestion = event;
  for (const fn of listeners) {
    try {
      fn(event);
    } catch {
      // ignore
    }
  }
}

async function prepareAudio(text) {
  try {
    const file = await synthesizeToFile(text);
    return file ? `/api/audio/${path.basename(file)}` : null;
  } catch {
    return null;
  }
}

async function maybeAlert(key, text, { cooldownMs = 10 * 60 * 1000, speak = true } = {}) {
  if (state.lastAlertKey === key && Date.now() - state.lastAlertAt < cooldownMs) return;
  state.lastAlertKey = key;
  state.lastAlertAt = Date.now();
  const audioUrl = speak ? await prepareAudio(text) : null;
  emit({
    type: "proactive",
    key,
    text,
    audioUrl,
    at: new Date().toISOString()
  });
}

async function tick() {
  try {
    const radar = await radarPayload();
    emit({ type: "radar", data: radar, at: radar.at });

    if (radar.ram >= 90) {
      const top = (radar.topApps || [])
        .slice(0, 3)
        .map((a) => `${a.name} ${a.mb}MB`)
        .join(", ");
      await maybeAlert(
        "ram-high",
        `Tu memoria está al ${radar.ram}%. ${top ? `Más pesados: ${top}.` : ""} ¿Quieres que cierre Chrome o apps pesadas?`
      );
    } else if (radar.ram >= 85) {
      await maybeAlert(
        "ram-warn",
        `RAM al ${radar.ram}%. Si se pone lenta, dime cierra Chrome.`,
        { cooldownMs: 20 * 60 * 1000 }
      );
    }

    // Git sucio en proyectos conocidos
    const projects = loadProjectsFile();
    for (const [name, val] of Object.entries(projects)) {
      const p = typeof val === "string" ? val : val?.path;
      if (!p) continue;
      const st = await gitStatus(p);
      if (st.ok && st.dirty && st.rawCount >= 3) {
        await maybeAlert(
          `git-dirty-${name}`,
          `Detecté ${st.rawCount} cambios sin commit en ${name}. ¿Quieres que revise el git status?`,
          { cooldownMs: 45 * 60 * 1000 }
        );
      }
    }

    // Watch long tasks
    for (const task of [...state.watchingTasks]) {
      await checkWatchTask(task);
    }
  } catch (error) {
    console.warn("[proactive]", error.message);
  }
}

async function checkWatchTask(task) {
  try {
    const st = await gitStatus(task.repoPath);
    const dirtyCount = st.rawCount || 0;
    const now = Date.now();

    if (task.mode === "idle_after_activity") {
      if (dirtyCount !== task.lastDirty) {
        task.lastDirty = dirtyCount;
        task.lastChangeAt = now;
      }
      const quietFor = now - (task.lastChangeAt || task.startedAt);
      if (task.sawActivity && quietFor > (task.quietMs || 8 * 60 * 1000)) {
        state.watchingTasks = state.watchingTasks.filter((t) => t.id !== task.id);
        await maybeAlert(
          `task-done-${task.id}`,
          task.doneMessage || `Creo que terminó el trabajo en ${task.label}. ¿Reviso los cambios?`,
          { cooldownMs: 1000 }
        );
      }
      if (dirtyCount > (task.baselineDirty || 0)) task.sawActivity = true;
    }

    if (now - task.startedAt > (task.maxMs || 3 * 60 * 60 * 1000)) {
      state.watchingTasks = state.watchingTasks.filter((t) => t.id !== task.id);
      await maybeAlert(
        `task-timeout-${task.id}`,
        `Pasó el tiempo de vigilancia de ${task.label}. ¿Sigo esperando o revisamos?`,
        { cooldownMs: 1000 }
      );
    }
  } catch {
    // ignore
  }
}

function watchProjectTask({ repoPath, label, doneMessage, quietMs, maxMs }) {
  const id = `w_${Date.now()}`;
  const repo = pickRepo(repoPath);
  const task = {
    id,
    repoPath: repo?.path || repoPath,
    label: label || "proyecto",
    doneMessage,
    quietMs: quietMs || 8 * 60 * 1000,
    maxMs: maxMs || 3 * 60 * 60 * 1000,
    mode: "idle_after_activity",
    startedAt: Date.now(),
    lastChangeAt: Date.now(),
    baselineDirty: 0,
    lastDirty: 0,
    sawActivity: false
  };
  gitStatus(task.repoPath).then((st) => {
    task.baselineDirty = st.rawCount || 0;
    task.lastDirty = task.baselineDirty;
  });
  state.watchingTasks.push(task);
  return task;
}

function startProactive(intervalMs = 55000) {
  tick();
  const timer = setInterval(tick, intervalMs);
  if (timer.unref) timer.unref();
  return timer;
}

module.exports = {
  startProactive,
  subscribe,
  watchProjectTask,
  getLastSuggestion: () => state.lastSuggestion,
  tick
};
