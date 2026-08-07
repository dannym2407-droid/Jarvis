const { spawn } = require("node:child_process");

/**
 * Habla con la voz del sistema Windows (System.Speech) — gratis, sin API.
 */
function speak(text, { rate = 0 } = {}) {
  const safe = String(text || "")
    .replace(/[`$]/g, "")
    .replace(/"/g, "'")
    .replace(/\r?\n/g, " ")
    .trim();

  if (!safe) return Promise.resolve();

  const script = `
Add-Type -AssemblyName System.Speech
$speak = New-Object System.Speech.Synthesis.SpeechSynthesizer
$speak.Rate = ${Number(rate) || 0}
$voices = $speak.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo }
$es = $voices | Where-Object { $_.Culture.Name -like 'es*' } | Select-Object -First 1
if ($es) { $speak.SelectVoice($es.Name) }
$speak.Speak("${safe}")
`;

  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
      { windowsHide: true }
    );
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `TTS exit ${code}`));
    });
  });
}

module.exports = { speak };
