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
const { handleConfirmSpeech, getPending } = require("../actions/git");
const { memoryContextForAi } = require("../memory/store");
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
  "workspace"
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
  const raw = String(text || "").trim();
  const input = stripWakeWord(raw);
  if (!input) {
    const say = getPending()
      ? "Sigo esperando tu confirma o cancela."
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

  let plan = matchLocalCommand(raw);
  if (!plan) {
    const mem = memoryContextForAi();
    plan = await askGroq(input, [
      {
        role: "system",
        content: `Memoria Jarvis: ${JSON.stringify(mem).slice(0, 900)}`
      },
      ...history.filter((m) => m.role !== "system")
    ]);
  }
  plan = enrichWhoami(plan);

  const action = plan.action || "none";
  let ack = null;
  let ackAudioUrl = null;
  let ackPromise = Promise.resolve();

  if (needsAck(action) || action === "delegate_code") {
    ack = plan.say && plan.say.length < 100 ? plan.say : pick(ACK_PHRASES);
    if (action === "delegate_code") ack = plan.say || "Voy con esa misión larga.";
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
    if (result.ok === false) say = result.message || "Se me trabó a mitad del plan.";
  } else if (INFO_ACTIONS.has(action) || action === "delegate_code") {
    say = result.message || plan.say || pick(DONE_PHRASES);
  } else if (result.ok === false) {
    say =
      result.message ||
      pick([
        "No pude completar eso, bro.",
        "Falló esa orden, ¿lo intentamos otra vez?",
        "No me salió. Dame otra pista."
      ]);
  } else if (needsAck(action) && plan.say && plan.say !== ack) {
    say = plan.say;
  } else {
    say = pick([...DONE_PHRASES, "Ya quedó, bro.", "Hecho, ¿qué sigue?", "Listo, eso ya corre."]);
  }

  say = String(say || "").replace(/\s+/g, " ").trim().slice(0, 520);

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
    ok: Boolean(result?.ok !== false),
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
