const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const ENV_PATH = path.join(ROOT, ".env");

function loadEnvFile() {
  if (!fs.existsSync(ENV_PATH)) return;
  const lines = fs.readFileSync(ENV_PATH, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile();

const config = {
  root: ROOT,
  port: Number(process.env.PORT || 8787),
  // 0.0.0.0 = accesible desde el teléfono en la misma WiFi
  host: process.env.HOST || "0.0.0.0",
  userName: process.env.USER_NAME || "Danny",
  voiceLang: process.env.VOICE_LANG || "es-MX",
  // Voz clara (mujer MX). Cambia en .env: VOICE_NAME=es-MX-JorgeNeural | es-ES-ElviraNeural | etc.
  voiceName: process.env.VOICE_NAME || process.env.VOICE_MALE || "es-MX-DaliaNeural",
  voiceMale: process.env.VOICE_NAME || process.env.VOICE_MALE || "es-MX-DaliaNeural",
  groqApiKey: process.env.GROQ_API_KEY || "",
  groqModel: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
  groqModelFast: process.env.GROQ_MODEL_FAST || "llama-3.1-8b-instant",
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || "",
  assistantName: "Jarvis"
};

module.exports = { config };
