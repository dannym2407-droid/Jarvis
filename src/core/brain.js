const { askGroq } = require("../ai");
const { runAction, matchLocalCommand } = require("../actions");
const { speak } = require("../voice/tts");

const history = [];

async function handleInstruction(text, { speakReply = true } = {}) {
  const input = String(text || "").trim();
  if (!input) {
    return { ok: false, say: "No te escuché.", result: null };
  }

  history.push({ role: "user", content: input });

  let plan = matchLocalCommand(input);
  if (!plan) {
    plan = await askGroq(input, history.filter((m) => m.role !== "system"));
  }

  const result = await runAction(plan.action, plan.args || {});
  const say =
    plan.say ||
    result.message ||
    (result.ok ? "Listo." : "No pude completar eso.");

  history.push({ role: "assistant", content: say });
  if (history.length > 20) history.splice(0, history.length - 20);

  if (speakReply) {
    try {
      await speak(say);
    } catch (error) {
      console.error("[tts]", error.message);
    }
  }

  return { ok: Boolean(result.ok !== false), say, action: plan.action, result };
}

function clearHistory() {
  history.length = 0;
}

module.exports = { handleInstruction, clearHistory, history };
