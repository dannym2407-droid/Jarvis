const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { config } = require("../config");
const { resolveProjectPath, loadProjectsFile } = require("../memory/store");
const { askGroq } = require("../ai");

const execFileAsync = promisify(execFile);

const pending = {
  type: null,
  payload: null,
  askedAt: 0
};

function setPending(type, payload) {
  pending.type = type;
  pending.payload = payload;
  pending.askedAt = Date.now();
}

function clearPending() {
  pending.type = null;
  pending.payload = null;
  pending.askedAt = 0;
}

function getPending() {
  if (pending.type && Date.now() - pending.askedAt > 120000) clearPending();
  return pending.type ? { ...pending } : null;
}

async function git(cwd, args) {
  const { stdout, stderr } = await execFileAsync("git", args, {
    cwd,
    windowsHide: true,
    maxBuffer: 2 * 1024 * 1024,
    timeout: 60000
  });
  return `${stdout || ""}${stderr || ""}`.trim();
}

function pickRepo(nameOrPath) {
  if (nameOrPath && fs.existsSync(nameOrPath) && fs.existsSync(path.join(nameOrPath, ".git"))) {
    return { name: path.basename(nameOrPath), path: nameOrPath };
  }
  const resolved = resolveProjectPath(nameOrPath || "jarvis");
  if (resolved && fs.existsSync(path.join(resolved.path, ".git"))) return resolved;

  // primer repo en projects.json
  const map = loadProjectsFile();
  for (const [name, val] of Object.entries(map)) {
    const p = typeof val === "string" ? val : val?.path;
    if (p && fs.existsSync(path.join(p, ".git"))) return { name, path: p };
  }
  if (fs.existsSync(path.join(config.root, ".git"))) {
    return { name: "Jarvis", path: config.root };
  }
  return null;
}

async function gitStatus(projectHint) {
  const repo = pickRepo(projectHint);
  if (!repo) return { ok: false, message: "No encontré un repo git. Agrégalo en data/projects.json." };

  try {
    const porcelain = await git(repo.path, ["status", "--porcelain"]);
    const branch = await git(repo.path, ["rev-parse", "--abbrev-ref", "HEAD"]);
    const lines = porcelain ? porcelain.split(/\r?\n/).filter(Boolean) : [];
    const modified = lines.filter((l) => /^[ M]M|^\sM|^M /.test(l) || /^ M/.test(l) || /^M /.test(l));
    const added = lines.filter((l) => /^\?\?|^A /.test(l));
    const deleted = lines.filter((l) => /^.D|^D /.test(l));

    const names = lines
      .map((l) => l.replace(/^../, "").trim())
      .filter(Boolean)
      .slice(0, 12);

    if (!lines.length) {
      return {
        ok: true,
        message: `Git Status · ${repo.name} (${branch}): sin cambios pendientes.`,
        repo,
        branch,
        dirty: false,
        files: []
      };
    }

    const summary = [
      `Git Status · ${repo.name} · rama ${branch}`,
      `✚ ${lines.length} cambio(s)`,
      modified.length ? `Modificados: ~${modified.length}` : null,
      added.length ? `Nuevos: ~${added.length}` : null,
      deleted.length ? `Borrados: ~${deleted.length}` : null,
      names.length ? `Archivos: ${names.join(", ")}` : null
    ]
      .filter(Boolean)
      .join(". ");

    return {
      ok: true,
      message: summary,
      repo,
      branch,
      dirty: true,
      files: names,
      rawCount: lines.length
    };
  } catch (error) {
    return { ok: false, message: `Git falló: ${String(error.message || error).slice(0, 160)}` };
  }
}

async function gitDiffStat(repoPath) {
  try {
    return await git(repoPath, ["diff", "--stat", "HEAD"]);
  } catch {
    try {
      return await git(repoPath, ["status", "-sb"]);
    } catch {
      return "";
    }
  }
}

async function prepareCommit(projectHint, userHint = "") {
  const status = await gitStatus(projectHint);
  if (!status.ok) return status;
  if (!status.dirty) return { ok: true, message: "No hay cambios para commitear." };

  let message = userHint?.trim();
  if (!message) {
    const diff = await gitDiffStat(status.repo.path);
    try {
      const plan = await askGroq(
        `Genera SOLO un mensaje de commit corto (1 línea, estilo conventional commits si aplica) para estos cambios del repo ${status.repo.name}. Archivos: ${status.files.join(", ")}. Diffstat: ${diff.slice(0, 800)}. Responde JSON {"action":"none","args":{},"say":"mensaje aquí"}`,
        []
      );
      message = (plan.say || "Update project files.").replace(/^["']|["']$/g, "").slice(0, 120);
    } catch {
      message = `Update ${status.files[0] || "files"}`;
    }
  }

  setPending("git_commit", {
    repo: status.repo,
    message,
    files: status.files,
    branch: status.branch
  });

  return {
    ok: true,
    message: `Propongo commit en ${status.repo.name}: "${message}". Di "confirma" o "cancela".`,
    needsConfirm: true
  };
}

async function confirmCommit() {
  const p = getPending();
  if (!p || p.type !== "git_commit") {
    return { ok: false, message: "No hay commit pendiente. Di: hazme un commit." };
  }
  const { repo, message } = p.payload;
  try {
    await git(repo.path, ["add", "-A"]);
    await git(repo.path, ["commit", "-m", message]);
    clearPending();
    return { ok: true, message: `Commit listo en ${repo.name}: ${message}` };
  } catch (error) {
    clearPending();
    return { ok: false, message: `No pude commitear: ${String(error.message || error).slice(0, 180)}` };
  }
}

async function cancelPending() {
  if (!getPending()) return { ok: true, message: "No había nada pendiente." };
  clearPending();
  return { ok: true, message: "Cancelado." };
}

async function gitPush(projectHint, branchHint) {
  const status = await gitStatus(projectHint);
  if (!status.ok) return status;
  const branch = branchHint || status.branch || "main";

  // Si hay cambios sin commit, avisar
  if (status.dirty) {
    setPending("git_push", { repo: status.repo, branch, hadDirty: true });
    return {
      ok: true,
      message: `Hay cambios sin commit en ${status.repo.name}. ¿Primero commit? Di "hazme un commit" o "empuja igual" / "push igual".`,
      needsConfirm: true
    };
  }

  setPending("git_push", { repo: status.repo, branch, hadDirty: false });
  return {
    ok: true,
    message: `Voy a subir ${status.repo.name} a origin/${branch}. Di "confirma" para pushear o "cancela".`,
    needsConfirm: true
  };
}

async function confirmPush(forceDirty = false) {
  const p = getPending();
  if (!p || p.type !== "git_push") {
    return { ok: false, message: "No hay push pendiente. Di: sube mis cambios." };
  }
  const { repo, branch, hadDirty } = p.payload;
  if (hadDirty && !forceDirty) {
    return {
      ok: false,
      message: "Todavía hay cambios locales. Haz commit primero, o di empuja igual."
    };
  }
  try {
    await git(repo.path, ["push", "-u", "origin", branch]);
    clearPending();
    return { ok: true, message: `Subí ${repo.name} a origin/${branch}.` };
  } catch (error) {
    clearPending();
    return { ok: false, message: `Push falló: ${String(error.message || error).slice(0, 180)}` };
  }
}

async function handleConfirmSpeech(text) {
  const t = String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  const p = getPending();
  if (!p) return null;

  if (/^(no|cancel|cancela|cancelar|olvidalo|olvídalo)/.test(t) || /\bcancela\b/.test(t)) {
    return cancelPending();
  }
  if (/empuja igual|push igual|sube igual/.test(t) && p.type === "git_push") {
    return confirmPush(true);
  }
  if (/^(si|sí|ok|dale|va|confirma|confirmar|hazlo|adelante|yes)\b/.test(t) || /\bconfirma\b/.test(t)) {
    if (p.type === "git_commit") return confirmCommit();
    if (p.type === "git_push") return confirmPush(false);
  }
  return null;
}

module.exports = {
  gitStatus,
  prepareCommit,
  confirmCommit,
  gitPush,
  confirmPush,
  cancelPending,
  getPending,
  setPending,
  clearPending,
  handleConfirmSpeech,
  pickRepo
};
