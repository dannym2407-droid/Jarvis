const path = require("node:path");
const fs = require("node:fs");
const { openApp, pasteText, sleep, runShell } = require("./system");
const { resolveProjectPath, rememberFact, upsertProject } = require("../memory/store");
const { pickRepo } = require("./git");
const { watchProjectTask } = require("../sense/proactive");
const { config } = require("../config");

function psQuote(text) {
  return `'${String(text).replace(/'/g, "''")}'`;
}

async function openInCursor(projectPath) {
  const cursor = path.join(
    require("node:os").homedir(),
    "AppData\\Local\\Programs\\cursor\\Cursor.exe"
  );
  if (fs.existsSync(cursor)) {
    await runShell(`Start-Process -FilePath ${psQuote(cursor)} -ArgumentList ${psQuote(projectPath)}`);
    return true;
  }
  try {
    await runShell(`cursor ${psQuote(projectPath)}`);
    return true;
  } catch {
    await openApp("cursor");
    return false;
  }
}

async function openInVsCode(projectPath) {
  try {
    await runShell(`code ${psQuote(projectPath)}`);
    return true;
  } catch {
    await openApp("vscode");
    return false;
  }
}

/**
 * Orden larga: abre Cursor/VS Code en un proyecto, pega el brief, y vigila hasta que “parezca” terminar.
 */
async function delegateCodingTask({
  project,
  prompt,
  editor = "cursor",
  notify = true
} = {}) {
  const resolved = resolveProjectPath(project) || pickRepo(project) || pickRepo("jarvis");
  if (!resolved?.path) {
    return {
      ok: false,
      message: "No encontré ese proyecto. Agrégalo en data/projects.json (nombre: ruta)."
    };
  }

  upsertProject(resolved.name, { path: resolved.path });
  rememberFact(`Delegué trabajo en ${resolved.name}: ${String(prompt || "").slice(0, 120)}`, "task");

  const brief =
    String(prompt || "").trim() ||
    `Trabaja en mejoras del proyecto ${resolved.name}. Sé práctico y deja el código listo.`;

  if (editor === "vscode") await openInVsCode(resolved.path);
  else await openInCursor(resolved.path);

  await sleep(2500);
  // Intenta abrir chat/agente (Ctrl+L en Cursor suele abrir chat)
  try {
    await runShell(`
$w = New-Object -ComObject WScript.Shell
$w.SendKeys('^l')
`);
    await sleep(800);
  } catch {
    // ignore
  }

  await pasteText(
    `Jarvis te asignó esta tarea para ${config.userName}:\n\n${brief}\n\nCuando termines, resume qué cambiaste.`,
    { enter: true, delayMs: 200 }
  );

  if (notify) {
    watchProjectTask({
      repoPath: resolved.path,
      label: resolved.name,
      doneMessage: `Parece que hubo actividad y luego se calmó en ${resolved.name}. ¿Reviso el git status o hago commit?`
    });
  }

  return {
    ok: true,
    message: `Abrí ${editor === "vscode" ? "VS Code" : "Cursor"} en ${resolved.name}, le pegué la tarea y te aviso cuando el repo se calme. Di "git status" cuando quieras.`
  };
}

async function longInstructionPlan(text) {
  // Heurística local para órdenes largas comunes
  const t = String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");

  const cursorWork =
    t.match(
      /(?:abre|abrir)\s+(cursor|vs\s*code|vscode|visualstudio|visual).{0,40}(?:dile|decile|pedile|pidele|que\s+)?(?:trabaje|trabajar|trabaj|arregle|mejore|haz|haga)\s+(?:en\s+|con\s+|sobre\s+)?(.+)$/
    ) ||
    t.match(
      /(?:cursor|vscode).{0,20}(?:trabaja|trabaj|arregla|mejora)\s+(?:en\s+|mi\s+)?(.+)$/
    ) ||
    t.match(
      /(?:delegale|delegá|deja(?:le)?)\s+(?:a\s+)?(?:cursor|vscode).{0,20}(?:el\s+)?(?:trabajo|tarea)\s+(?:de\s+|en\s+)?(.+)$/
    );

  if (cursorWork) {
    const editor = /vscode|visual|vs code/.test(cursorWork[1] || t) ? "vscode" : "cursor";
    const rest = (cursorWork[2] || cursorWork[1] || "").trim();
    // "mi portafolio" / "portfolio" / "ecokinal"
    const projectMatch = rest.match(
      /(portafolio|portfolio|ecokinal|jarvis|aditus|kinal|[\w\-]+)/
    );
    const project = projectMatch ? projectMatch[1] : rest.split(/\s+/).slice(0, 3).join(" ");
    return {
      action: "delegate_code",
      args: {
        project,
        prompt: rest,
        editor,
        notify: !/sin avisar|no me avis/.test(t)
      },
      say: `Va, abro ${editor} y le dejo el trabajo.`
    };
  }

  return null;
}

module.exports = {
  delegateCodingTask,
  longInstructionPlan,
  openInCursor,
  openInVsCode
};
