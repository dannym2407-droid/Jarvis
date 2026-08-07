const { askGroq } = require("../ai");
const { runAction, matchLocalCommand, stripWakeWord } = require("../actions");
const {
  speak,
  synthesizeToFile,
  ACK_PHRASES,
  DONE_PHRASES,
  FAIL_PHRASES
} = require("../voice/tts");
const { config } = require("../config");
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
  "countdown"
]);

function needsAck(action) {
  return Boolean(action) && action !== "none" && action !== "multi" && !INFO_ACTIONS.has(action);
}

async function prepareAudio(text) {
  if (!text) return null;
  try {
    const file = await synthesizeToFile(text);
    if (!file) return null;
    return `/api/audio/${path.basename(file)}`;
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

async function handleInstruction(text, { speakReply = true, browserAudio = false } = {}) {
  const input = stripWakeWord(String(text || "").trim());
  if (!input) {
    const say = "Te escucho, bro. Dime con confianza.";
    const audioUrl = browserAudio ? await prepareAudio(say) : null;
    if (speakReply && !browserAudio) await speak(say).catch(() => {});
    return { ok: false, say, audioUrl, result: null };
  }

  history.push({ role: "user", content: input });

  let plan = matchLocalCommand(input);
  if (!plan) {
    plan = await askGroq(input, history.filter((m) => m.role !== "system"));
  }
  plan = enrichWhoami(plan);

  const action = plan.action || "none";
  let ack = null;
  let ackAudioUrl = null;
  let ackPromise = Promise.resolve();

  if (needsAck(action)) {
    ack = plan.say && plan.say.length < 80 ? plan.say : pick(ACK_PHRASES);
    if (browserAudio) {
      ackAudioUrl = await prepareAudio(ack);
    } else if (speakReply) {
      ackPromise = speak(ack).catch((e) => console.error("[tts-ack]", e.message));
    }
  }

  const [result] = await Promise.all([runAction(action, plan.args || {}), ackPromise]);

  let say;
  if (action === "none") {
    say = plan.say || "¿Qué más ocupas?";
  } else if (action === "multi") {
    say =
      plan.say ||
      result.message ||
      pick(["Listo, hice todo eso.", "Ya corrí los pasos.", "Hecho, bro."]);
    if (result.ok === false) {
      say = result.message || "Se me trabó a mitad del plan.";
    }
  } else if (INFO_ACTIONS.has(action)) {
    // Combina dato real + estilo libre si venía say
    say = result.message || plan.say || pick(DONE_PHRASES);
    if (plan.say && result.message && plan.say !== result.message && plan.say.length < 120) {
      say = `${result.message} ${plan.say}`;
    }
  } else if (result.ok === false) {
    say =
      result.message ||
      pick([
        "No pude completar eso, bro.",
        "Falló esa orden, ¿lo intentamos otra vez?",
        "No me salió. Dame otra pista."
      ]);
  } else if (needsAck(action) && plan.say && plan.say !== ack) {
    // Confirmación con personalidad
    say = plan.say;
  } else {
    say = pick([
      ...DONE_PHRASES,
      "Ya quedó, bro.",
      "Hecho, ¿qué sigue?",
      "Listo, eso ya corre.",
      "Va, cumplido."
    ]);
  }

  // Límite cómodo para voz, pero más largo que antes
  say = String(say || "").replace(/\s+/g, " ").trim().slice(0, 420);

  history.push({ role: "assistant", content: ack ? `${ack} ${say}` : say });
  if (history.length > 28) history.splice(0, history.length - 28);

  let audioUrl = null;
  if (browserAudio) {
    audioUrl = await prepareAudio(say);
  } else if (speakReply) {
    try {
      await speak(say);
    } catch (error) {
      console.error("[tts]", error.message);
    }
  }

  return {
    ok: Boolean(result.ok !== false),
    say,
    ack,
    ackAudioUrl,
    audioUrl,
    action,
    result
  };
}

function clearHistory() {
  history.length = 0;
}

module.exports = { handleInstruction, clearHistory, history };
