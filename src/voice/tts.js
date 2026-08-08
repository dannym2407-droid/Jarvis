const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { config } = require("../config");

const CACHE_DIR = path.join(os.homedir(), ".jarvis-tts-cache");
const SPEAK_PY = path.join(config.root, "scripts", "speak.py");

const ACK_PHRASES = [
  "Ya voy, estoy en eso.",
  "Dale, ahora mismo.",
  "Entendido, lo hago.",
  "Va, me pongo en eso.",
  "De una, estoy en eso.",
  "Perfecto, ya voy."
];

const DONE_PHRASES = ["Listo.", "Hecho.", "Ya quedó.", "Listo, bro."];
const FAIL_PHRASES = ["No pude completarlo.", "Falló esa orden."];

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function sanitize(text) {
  return String(text || "")
    .replace(/\r?\n/g, " ")
    .replace(/[^\S\r\n]+/g, " ")
    .trim()
    .slice(0, 480);
}

function cacheFileFor(text, voice = config.voiceName || config.voiceMale || "es-MX-DaliaNeural") {
  ensureCacheDir();
  const key = crypto.createHash("sha1").update(`${voice}|${text}`).digest("hex");
  return path.join(CACHE_DIR, `${key}.mp3`);
}

function run(command, args, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("timeout"));
    }, timeoutMs);
    child.stderr.on("data", (c) => {
      stderr += c.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(stderr || `exit ${code}`));
    });
  });
}

/**
 * Genera (o reutiliza) MP3 masculino. El navegador lo reproduce.
 */
function getCachedAudioFile(text) {
  const safe = sanitize(text);
  if (!safe) return null;
  const voice = config.voiceName || config.voiceMale || "es-MX-DaliaNeural";
  const out = cacheFileFor(safe, voice);
  if (fs.existsSync(out) && fs.statSync(out).size > 100) return out;
  return null;
}

async function synthesizeToFile(text) {
  const safe = sanitize(text);
  if (!safe) return null;
  const voice = config.voiceName || config.voiceMale || "es-MX-DaliaNeural";
  const out = cacheFileFor(safe, voice);
  if (fs.existsSync(out) && fs.statSync(out).size > 100) return out;

  // speak.py --warm solo genera; también podemos usar edge_tts CLI
  await run("python", ["-m", "edge_tts", "--voice", voice, "--text", safe, "--write-media", out]);
  return out;
}

/** Genera en background para la próxima vez (no bloquea la respuesta). */
function warmAudioAsync(text) {
  synthesizeToFile(text).catch(() => {});
}

async function speakSapi(text, { rate = 1 } = {}) {
  const safe = sanitize(text).replace(/"/g, "'");
  const script = `
Add-Type -AssemblyName System.Speech
$speak = New-Object System.Speech.Synthesis.SpeechSynthesizer
$speak.Rate = ${Number(rate) || 1}
$voices = $speak.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo }
$es = $voices | Where-Object { $_.Culture.Name -like 'es-MX*' } | Select-Object -First 1
if (-not $es) { $es = $voices | Where-Object { $_.Culture.Name -like 'es*' } | Select-Object -First 1 }
if ($es) { $speak.SelectVoice($es.Name) }
$speak.Speak("${safe}")
`;
  await run("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    script
  ]);
}

/**
 * Habla en el servidor (fallback). Preferimos audio por navegador.
 */
async function speak(text) {
  const safe = sanitize(text);
  if (!safe) return;
  try {
    const file = await synthesizeToFile(safe);
    if (!file) return;
    // Intenta MediaPlayer; si falla, SAPI
    const ps = `
Add-Type -AssemblyName PresentationCore
$p = New-Object System.Windows.Media.MediaPlayer
$p.Volume = 1
$p.Open([Uri]::new('${file.replace(/'/g, "''")}'))
$sw = [Diagnostics.Stopwatch]::StartNew()
while (-not $p.NaturalDuration.HasTimeSpan) { if ($sw.Elapsed.TotalSeconds -gt 8) { throw 'load' }; Start-Sleep -Milliseconds 40 }
$p.Play(); $end = $p.NaturalDuration.TimeSpan
while ($p.Position -lt $end) { Start-Sleep -Milliseconds 40 }
$p.Close()
`;
    await run("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      ps
    ]);
  } catch (error) {
    console.warn("[tts] playback server falló, SAPI:", error.message);
    await speakSapi(safe);
  }
}

function speakAsync(text) {
  return speak(text).catch((e) => console.error("[tts]", e.message));
}

async function warmVoiceCache() {
  const phrases = [
    ...ACK_PHRASES,
    ...DONE_PHRASES,
    ...FAIL_PHRASES,
    "Te escucho.",
    "Dime.",
    "¿Qué necesitas?",
    "Hubo un error."
  ];
  for (const phrase of phrases) {
    try {
      await synthesizeToFile(phrase);
    } catch (error) {
      console.warn("[tts-warm]", phrase, error.message);
    }
  }
  console.log("[tts] caché de voz lista");
}

module.exports = {
  speak,
  speakAsync,
  synthesizeToFile,
  getCachedAudioFile,
  warmAudioAsync,
  cacheFileFor,
  sanitize,
  warmVoiceCache,
  ACK_PHRASES,
  DONE_PHRASES,
  FAIL_PHRASES
};
