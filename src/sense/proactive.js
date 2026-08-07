const { radarPayload } = require("./workspace");
const { gitStatus, pickRepo } = require("../actions/git");
const { loadProjectsFile } = require("../memory/store");
const { synthesizeToFile } = require("../voice/tts");
const { setOffer } = require("../core/confirm");
const { healthcheckProject, listProjectProfiles } = require("../actions/projects");
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

async function maybeAlert(key, text, { cooldownMs = 10 * 60 * 1000, speak = true, steps = null } = {}) {
  if (state.lastAlertKey === key && Date.now() - state.lastAlertAt < cooldownMs) return;
  state.lastAlertKey = key;
  state.lastAlertAt = Date.now();

  if (steps?.length) {
    setOffer({
      type: key,
      text,
      steps,
      ttlMs: Math.max(cooldownMs, 3 * 60 * 1000)
    });
  }

  const audioUrl = speak ? await prepareAudio(text) : null;
  emit({
    type: "proactive",
    key,
    text,
    audioUrl,
    hasAction: Boolean(steps?.length),
    at: new Date().toISOString()
  });
}

async function tick() {
  try {
    const radar = await radarPayload();
    emit({ type: "radar", data: radar, at: radar.at });

    if (radar.ram >= 90) {
      const top = (radar.topApps || []).slice(0, 3);
      const chromeHeavy = top.find((a) => /chrome|msedge/i.test(a.name));
      const steps = chromeHeavy
        ? [{ action: "kill_process", args: { name: "chrome" } }]
        : top[0]
          ? [{ action: "kill_process", args: { name: top[0].name } }]
          : [{ action: "kill_process", args: { name: "chrome" } }];

      await maybeAlert(
        "ram-high",
        `Tu memoria está al ${radar.ram}%. ${
          chromeHeavy ? `Chrome pesa ~${chromeHeavy.mb}MB.` : ""
        } ¿Quieres que lo cierre? Di sí.`,
        { steps }
      );
    } else if (radar.ram >= 85) {
      await maybeAlert(
        "ram-warn",
        `RAM al ${radar.ram}%. Si se pone lenta, dime cierra Chrome o di sí si te ofrezco cerrarlo.`,
        {
          cooldownMs: 20 * 60 * 1000,
          steps: [{ action: "kill_process", args: { name: "chrome" } }]
        }
      );
    }

    const projects = loadProjectsFile();
    for (const [name, val] of Object.entries(projects)) {
      const p = typeof val === "string" ? val : val?.path;
      if (!p) continue;
      const st = await gitStatus(p);
      if (st.ok && st.dirty && st.rawCount >= 3) {
        await maybeAlert(
          `git-dirty-${name}`,
          `Detecté ${st.rawCount} cambios sin commit en ${name}. ¿Reviso el git status? Di sí.`,
          {
            cooldownMs: 45 * 60 * 1000,
            steps: [{ action: "git_status", args: { project: name } }]
          }
        );
      }
    }

    // Healthcheck ligero de perfiles
    for (const profile of listProjectProfiles().slice(0, 4)) {
      if (!profile.ports?.length && !profile.health?.length) continue;
      const hc = await healthcheckProject(profile.name);
      const closed = (hc.portResults || []).filter((x) => !x.open);
      const open = (hc.portResults || []).filter((x) => x.open);
      if (open.length && closed.length && closed.length >= Math.ceil((hc.portResults || []).length / 2)) {
        await maybeAlert(
          `health-${profile.name}`,
          `${profile.name}: puertos ON ${open.map((x) => x.port).join(",")} · OFF ${closed
            .map((x) => x.port)
            .join(",")}. ¿Corro healthcheck completo? Di sí.`,
          {
            cooldownMs: 30 * 60 * 1000,
            steps: [{ action: "project_health", args: { project: profile.name } }]
          }
        );
      }
    }

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
          task.doneMessage || `Parece que terminó el trabajo en ${task.label}. ¿Reviso git? Di sí.`,
          {
            cooldownMs: 1000,
            steps: [{ action: "git_status", args: { project: task.label } }]
          }
        );
      }
      if (dirtyCount > (task.baselineDirty || 0)) task.sawActivity = true;
    }

    if (now - task.startedAt > (task.maxMs || 3 * 60 * 60 * 1000)) {
      state.watchingTasks = state.watchingTasks.filter((t) => t.id !== task.id);
      await maybeAlert(
        `task-timeout-${task.id}`,
        `Pasó el tiempo de vigilancia de ${task.label}. ¿Revisamos cambios? Di sí.`,
        {
          cooldownMs: 1000,
          steps: [{ action: "git_status", args: { project: task.label } }]
        }
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
