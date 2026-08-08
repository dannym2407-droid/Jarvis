const { askGroq } = require("../ai");
const { runAction, matchLocalCommand, stripWakeWord, resolveAppName } = require("../actions");
const {
  speak,
  getCachedAudioFile,
  warmAudioAsync,
  ACK_PHRASES,
  DONE_PHRASES,
  FAIL_PHRASES
} = require("../voice/tts");
const { config } = require("../config");
const { handleConfirmSpeech, getPending } = require("../actions/git");
const { memoryContextForAi } = require("../memory/store");
const { getOffer, clearOffer, isAffirmative, isNegative } = require("./confirm");
const path = require("node:path");

const history = [];

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

const INFO_ACTIONS = new Set([
  "tell_time",
  "tell_date",
  "weather",
  "battery",
  "system_status",
  "clipboard",
  "joke",
  "motivation",
  "whoami",
  "crypto",
  "coin_flip",
  "dice",
  "password",
  "password_copy",
  "wifi_info",
  "list_processes",
  "run_cmd",
  "briefing",
  "clipboard_ai",
  "smart_answer",
  "recall",
  "disk_space",
  "ip_info",
  "exchange",
  "stock",
  "translate",
  "wiki_summary",
  "large_downloads",
  "find_file",
  "read_file",
  "list_dir",
  "countdown",
  "git_status",
  "git_commit",
  "git_push",
  "git_confirm",
  "git_cancel",
  "diagnose",
  "radar",
  "workspace",
  "explain_terminal",
  "project_health",
  "accept_offer"
]);

function needsAck(action) {
  return (
    Boolean(action) &&
    action !== "none" &&
    action !== "multi" &&
    action !== "delegate_code" &&
    !INFO_ACTIONS.has(action)
  );
}

async function prepareAudio(text) {
  if (!text) return null;
  try {
    const cached = getCachedAudioFile(text);
    if (cached) return `/api/audio/${path.basename(cached)}`;
    // No bloquea: prepara para la próxima vez
    warmAudioAsync(text);
    return null;
  } catch (error) {
    console.warn("[tts-prep]", error.message);
    return null;
  }
}

function enrichWhoami(plan) {
  if (plan.action === "whoami") {
    plan.args = { ...(plan.args || {}), userName: config.userName };
  }
  return plan;
}

/** Si la IA no eligió acción pero el texto es una orden clara. */
function heuristicIntent(text) {
  const t = String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[¿?¡!.,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const open = t.match(/^(?:abre|abrir|open)\s+(?:el |la |los |las )?(.+)$/);
  if (open) {
    const name = open[1].trim();
    const app = resolveAppName(name);
    if (app) return { action: "open_app", args: { name: app }, say: `Abro ${app}.` };
    return { action: "launch_any", args: { name }, say: `Abro ${name}.` };
  }

  const kill = t.match(/^(?:cierra|cerrar|mata|kill)\s+(?:el |la |los |las )?(.+)$/);
  if (kill && !/todas|todo/.test(kill[1])) {
    return { action: "kill_process", args: { name: kill[1].trim() }, say: `Cierro ${kill[1].trim()}.` };
  }

  const search = t.match(/^(?:busca|buscar|googlea|google)\s+(.+)$/);
  if (search) {
    return { action: "search_web", args: { query: search[1].trim(), type: "web" }, say: `Busco ${search[1].trim()}.` };
  }

  if (/que hora|hora es/.test(t)) return { action: "tell_time", args: {}, say: null };
  if (/que dia|que fecha/.test(t)) return { action: "tell_date", args: {}, say: null };

  return null;
}

/** Si la IA mandó find_file/launch raro para una app conocida, corrige. */
function coerceAppPlan(plan, text) {
  const p = plan || { action: "none", args: {}, say: "" };
  const openHint = String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");

  const wantsOpen = /^(abre|abrir|open)\b/.test(openHint.trim()) || /\babre\b/.test(openHint);
  const nameGuess =
    p.args?.name ||
    p.args?.query ||
    openHint.match(/(?:abre|abrir|open)\s+(?:el |la |los |las )?(.+)$/)?.[1] ||
    "";

  const app = resolveAppName(nameGuess) || resolveAppName(openHint);
  if (app && (wantsOpen || ["launch_any", "find_file", "open_found", "start_search", "open_path", "open_desktop"].includes(p.action))) {
    return {
      action: "open_app",
      args: { name: app },
      say: p.say && p.say.length < 60 ? p.say : `Abro ${app === "vscode" ? "VS Code" : app}.`
    };
  }

  if (p.action === "open_app" && p.args?.name) {
    const fixed = resolveAppName(p.args.name) || p.args.name;
    return { ...p, args: { ...p.args, name: fixed } };
  }

  return p;
}

async function handleInstruction(text, { speakReply = true, browserAudio = false, speakSystem = false } = {}) {
  const started = Date.now();
  const raw = String(text || "").trim();
  const input = stripWakeWord(raw);
  if (!input) {
    const say =
      getPending() || getOffer()
        ? "Sigo esperando tu sí o cancela."
        : "Hey, te escucho. Dime la orden.";
    const audioUrl = browserAudio ? await prepareAudio(say) : null;
    if (speakReply && !browserAudio) await speak(say).catch(() => {});
    return { ok: true, say, audioUrl, result: null, action: "none" };
  }

  history.push({ role: "user", content: input });

  if (getPending()) {
    const confirmed = await handleConfirmSpeech(input);
    if (confirmed) {
      const say = confirmed.message || "Listo.";
      history.push({ role: "assistant", content: say });
      const audioUrl = browserAudio ? await prepareAudio(say) : null;
      if (speakReply && !browserAudio) await speak(say).catch(() => {});
      return {
        ok: confirmed.ok !== false,
        say,
        audioUrl,
        action: "git_confirm",
        result: confirmed
      };
    }
  }

  const offer = getOffer();
  if (offer) {
    if (isNegative(input)) {
      clearOffer();
      const say = "Va, lo dejo. No hago nada.";
      history.push({ role: "assistant", content: say });
      const audioUrl = browserAudio ? await prepareAudio(say) : null;
      if (speakReply && !browserAudio) await speak(say).catch(() => {});
      return { ok: true, say, audioUrl, action: "accept_offer", result: { ok: true } };
    }
    if (isAffirmative(input)) {
      clearOffer();
      const result = await runAction("multi", { steps: offer.steps || [] });
      const say = result.message || "Hecho, ejecuté lo que te ofrecí.";
      history.push({ role: "assistant", content: say });
      const audioUrl = browserAudio ? await prepareAudio(say) : null;
      if (speakReply && !browserAudio) await speak(say).catch(() => {});
      return {
        ok: result.ok !== false,
        say,
        audioUrl,
        action: "accept_offer",
        result
      };
    }
  }

  let plan = matchLocalCommand(raw);
  // Defensa: nunca aceptar promesas/objetos vacíos como plan
  if (!plan || typeof plan.then === "function" || !plan.action) {
    plan = null;
  }

  if (!plan) {
    try {
      const mem = memoryContextForAi();
      plan = await askGroq(input, [
        { role: "system", content: `Memoria corta: ${JSON.stringify(mem).slice(0, 400)}` },
        ...history.filter((m) => m.role !== "system").slice(-6)
      ]);
    } catch (error) {
      console.warn("[groq]", error.message);
      plan = heuristicIntent(input) || {
        action: "none",
        args: {},
        say: "Se me trabó la IA. Repite la orden más corto, tipo: abre WhatsApp."
      };
    }
  }

  if ((!plan || plan.action === "none") && heuristicIntent(input)) {
    const forced = heuristicIntent(input);
    // Solo fuerza si la IA no dio una respuesta conversacional útil
    if (!plan?.say || plan.action === "none") {
      plan = forced;
    }
  }

  plan = enrichWhoami(plan || { action: "none", args: {}, say: "No te agarré, repite." });
  plan = coerceAppPlan(plan, input);

  const action = plan.action || "none";
  // Sin ack de audio (era lento). Solo frase final.
  const ack = needsAck(action) || action === "delegate_code"
    ? plan.say && plan.say.length < 80
      ? plan.say
      : pick(ACK_PHRASES)
    : null;

  const result = await runAction(action, plan.args || {});

  let say;
  if (action === "none") {
    say = plan.say || "¿Qué más ocupas?";
  } else if (action === "multi") {
    say = plan.say || result.message || pick(DONE_PHRASES);
    if (result.ok === false) say = result.message || "Se me trabó a mitad del plan.";
  } else if (INFO_ACTIONS.has(action) || action === "delegate_code") {
    say = result.message || plan.say || pick(DONE_PHRASES);
  } else if (result.ok === false) {
    say = result.message || pick(FAIL_PHRASES);
  } else {
    say = plan.say && plan.say !== ack ? plan.say : pick(DONE_PHRASES);
  }

  say = String(say || "").replace(/\s+/g, " ").trim().slice(0, 420);

  history.push({ role: "assistant", content: say });
  if (history.length > 20) history.splice(0, history.length - 20);

  let audioUrl = null;
  const shouldSpeakOutLoud = speakSystem || process.env.JARVIS_ELECTRON === "1" || (speakReply && !browserAudio);
  if (browserAudio) {
    audioUrl = await prepareAudio(say);
  }
  // Habla por el sistema (se oye aunque estés en otra app)
  if (shouldSpeakOutLoud) {
    try {
      if (speakSystem || process.env.JARVIS_ELECTRON === "1") {
        speak(say).catch((e) => console.error("[tts]", e.message));
      } else {
        await speak(say);
      }
    } catch (error) {
      console.error("[tts]", error.message);
    }
  }

  console.log(`[brain] ${Date.now() - started}ms action=${action}`);

  return {
    ok: Boolean(result?.ok !== false),
    say,
    ack: null,
    ackAudioUrl: null,
    audioUrl,
    action,
    result
  };
}

function clearHistory() {
  history.length = 0;
}

module.exports = { handleInstruction, clearHistory, history };
