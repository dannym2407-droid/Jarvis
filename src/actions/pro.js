const { runShell, openApp, openUrl, sleep, getWeather, batteryStatus, systemStatus, tellTime } = require("./system");
const { wifiInfo, killProcess, showDesktop, openCamera } = require("./extra");
const { askGroq } = require("../ai");
const { config } = require("../config");

async function sendKeys(sequence) {
  await runShell(`
$w = New-Object -ComObject WScript.Shell
$w.SendKeys(${JSON.stringify(sequence)})
`);
}

async function windowControl(action) {
  const map = {
    left: "^{LEFT}", // fallback; Win keys via shell
    right: "^{RIGHT}",
    maximize: "%{ }" // Alt+Space then x later
  };
  void map;
  if (action === "left") {
    await runShell(`
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class JarvisWinKeys {
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
}
"@
# Win+Left
[JarvisWinKeys]::keybd_event(0x5B, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 40
[JarvisWinKeys]::keybd_event(0x25, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 40
[JarvisWinKeys]::keybd_event(0x25, 0, 2, [UIntPtr]::Zero)
[JarvisWinKeys]::keybd_event(0x5B, 0, 2, [UIntPtr]::Zero)
`);
    return { ok: true, message: "Ventana a la izquierda." };
  }
  if (action === "right") {
    await runShell(`
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class JarvisWinKeys2 {
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
}
"@
[JarvisWinKeys2]::keybd_event(0x5B, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 40
[JarvisWinKeys2]::keybd_event(0x27, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 40
[JarvisWinKeys2]::keybd_event(0x27, 0, 2, [UIntPtr]::Zero)
[JarvisWinKeys2]::keybd_event(0x5B, 0, 2, [UIntPtr]::Zero)
`);
    return { ok: true, message: "Ventana a la derecha." };
  }
  if (action === "maximize") {
    await runShell(`
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class JarvisWinKeys3 {
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
}
"@
[JarvisWinKeys3]::keybd_event(0x5B, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 40
[JarvisWinKeys3]::keybd_event(0x26, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 40
[JarvisWinKeys3]::keybd_event(0x26, 0, 2, [UIntPtr]::Zero)
[JarvisWinKeys3]::keybd_event(0x5B, 0, 2, [UIntPtr]::Zero)
`);
    return { ok: true, message: "Ventana maximizada." };
  }
  if (action === "minimize") {
    await sendKeys("% n");
    return { ok: true, message: "Ventana minimizada." };
  }
  return { ok: false, message: "No entendí el control de ventana." };
}

async function briefing() {
  const parts = [];
  parts.push((await tellTime()).message);
  try {
    parts.push((await batteryStatus()).message);
  } catch {
    // ignore
  }
  try {
    parts.push((await systemStatus()).message);
  } catch {
    // ignore
  }
  try {
    parts.push((await getWeather("Guatemala")).message);
  } catch {
    // ignore
  }
  try {
    parts.push((await wifiInfo()).message);
  } catch {
    // ignore
  }
  const text = `Briefing listo. ${parts.filter(Boolean).join(" ")}`;
  return { ok: true, message: text };
}

async function clipboardAi(mode = "summary") {
  let clip = "";
  try {
    clip = await runShell(
      "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::GetText()"
    );
  } catch {
    return { ok: false, message: "No pude leer el portapapeles." };
  }
  if (!clip || clip.trim().length < 2) {
    return { ok: false, message: "El portapapeles está vacío." };
  }

  const prompts = {
    summary: `Resume esto en 2 oraciones claras para leer en voz alta:\n\n${clip.slice(0, 3500)}`,
    translate: `Traduce esto al español neutro, corto y natural para voz:\n\n${clip.slice(0, 3500)}`,
    improve: `Mejora este texto (más claro y profesional), solo el resultado final:\n\n${clip.slice(0, 3500)}`,
    explain: `Explícame esto fácil, en máximo 3 oraciones:\n\n${clip.slice(0, 3500)}`
  };

  const plan = await askGroq(prompts[mode] || prompts.summary, []);
  const answer = plan.say || "No pude procesarlo.";
  return { ok: true, message: answer };
}

async function runMode(mode) {
  const key = String(mode || "").toLowerCase();

  if (key === "morning" || key === "manana" || key === "mañana") {
    const info = await briefing();
    await openApp("chrome");
    await sleep(800);
    await openUrl("https://mail.google.com");
    return {
      ok: true,
      message: `Modo mañana activado. ${info.message} Te abrí el navegador y Gmail.`
    };
  }

  if (key === "focus" || key === "enfoque" || key === "concentracion" || key === "concentración") {
    for (const app of ["discord", "spotify", "tiktok"]) {
      try {
        await killProcess(app);
      } catch {
        // ignore
      }
    }
    await openApp("cursor");
    return {
      ok: true,
      message: "Modo enfoque: cerré distracciones y abrí Cursor. A codear, bro."
    };
  }

  if (key === "coding" || key === "programar" || key === "codigo" || key === "código") {
    await openApp("cursor");
    await sleep(600);
    await openApp("chrome");
    await sleep(500);
    await openUrl("https://github.com");
    return {
      ok: true,
      message: "Modo coding listo: Cursor, Chrome y GitHub en marcha."
    };
  }

  if (key === "chill" || key === "relax" || key === "descanso") {
    await openApp("spotify");
    await sleep(700);
    await openUrl("https://www.youtube.com");
    return {
      ok: true,
      message: "Modo chill: Spotify y YouTube listos. Disfruta."
    };
  }

  if (key === "gaming" || key === "juego" || key === "jugar") {
    await showDesktop();
    try {
      await openApp("discord");
    } catch {
      // ignore
    }
    return {
      ok: true,
      message: "Modo gaming: escritorio limpio y Discord listo si lo tienes."
    };
  }

  if (key === "meeting" || key === "reunion" || key === "reunión") {
    await openUrl("https://meet.google.com");
    await sleep(500);
    try {
      await openCamera();
    } catch {
      // ignore
    }
    return {
      ok: true,
      message: "Modo reunión: Meet y cámara listos."
    };
  }

  return {
    ok: false,
    message: "Modos disponibles: mañana, enfoque, coding, chill, gaming y reunión."
  };
}

async function smartAnswer(question) {
  const q = String(question || "").trim();
  if (!q) return { ok: false, message: "¿Qué quieres saber?" };
  const plan = await askGroq(
    `Responde como Jarvis, útil y directo, máximo 3 oraciones, para voz. Pregunta: ${q}`,
    []
  );
  return { ok: true, message: plan.say || "No tengo una buena respuesta ahora." };
}

async function rememberFact(text) {
  const fs = require("node:fs");
  const path = require("node:path");
  const file = path.join(config.root, "data", "memory.json");
  let memory = [];
  try {
    memory = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!Array.isArray(memory)) memory = [];
  } catch {
    memory = [];
  }
  memory.push({ at: new Date().toISOString(), text: String(text || "").trim() });
  memory = memory.slice(-50);
  fs.writeFileSync(file, JSON.stringify(memory, null, 2), "utf8");
  return { ok: true, message: "Quedó en mi memoria." };
}

async function recallMemory() {
  const fs = require("node:fs");
  const path = require("node:path");
  const file = path.join(config.root, "data", "memory.json");
  try {
    const memory = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!Array.isArray(memory) || !memory.length) {
      return { ok: true, message: "Aún no tengo nada guardado en memoria." };
    }
    const last = memory.slice(-3).map((m) => m.text).join(". ");
    return { ok: true, message: `Recuerdo esto: ${last}` };
  } catch {
    return { ok: true, message: "Aún no tengo memoria guardada." };
  }
}

module.exports = {
  windowControl,
  briefing,
  clipboardAi,
  runMode,
  smartAnswer,
  rememberFact,
  recallMemory
};
