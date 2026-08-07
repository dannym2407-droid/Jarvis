const orbBtn = document.getElementById("orbBtn");
const stateLine = document.getElementById("stateLine");
const heardLine = document.getElementById("heardLine");

let busy = false;
let wakeRecognition = null;
let wakeMode = false;
let muted = false;
let currentAudio = null;

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const WAKE_RE =
  /\b((hey|oye|ok|okay|hola|ei|ey)\s+)?(jarvis|yarvis|jarviz|yarbis|jarbi|jarbis|harvey|jarves|llaves|yavis)\b/i;
const COMMAND_RE =
  /\b(abre|abrir|busca|buscar|google|escribe|mandale|manda|envia|enviale|cierra|cerrar|bloquea|captura|sube|baja|volumen|whatsapp|wasap|hora|fecha|cursor|chrome|visual|spotify|youtube|clima|tiempo|bateria|batería|anota|nota|chiste|papelera|descargas|escritorio|portapapeles|sistema|wifi|mapa|wikipedia|noticias|temporizador|timer|bitcoin|ethereum|gmail|netflix|tiktok|motiv|apag|reinic|dado|moneda|contraseña|password|camara|cámara|paint|procesos|define|carpeta|imagenes|imágenes|videos|aplicaciones|apps)\b/i;

function setOrb(mode) {
  orbBtn.classList.remove("idle", "listening", "thinking", "speaking", "paused");
  orbBtn.classList.add(mode || "idle");
}

function setState(text) {
  stateLine.textContent = text;
}

function showHeard(text) {
  if (!text) {
    heardLine.hidden = true;
    heardLine.textContent = "";
    return;
  }
  heardLine.hidden = false;
  heardLine.textContent = `"${text}"`;
}

function stopAudio() {
  if (currentAudio) {
    try {
      currentAudio.pause();
    } catch {
      // ignore
    }
    currentAudio = null;
  }
}

function playAudioUrl(url) {
  return new Promise((resolve) => {
    if (!url) {
      resolve();
      return;
    }
    stopAudio();
    const audio = new Audio(url);
    currentAudio = audio;
    audio.onended = () => {
      if (currentAudio === audio) currentAudio = null;
      resolve();
    };
    audio.onerror = () => {
      if (currentAudio === audio) currentAudio = null;
      resolve();
    };
    setOrb("speaking");
    audio.play().catch(() => resolve());
  });
}

async function api(path, body) {
  const res = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function extractAfterWake(transcript) {
  const text = String(transcript || "").trim();
  if (!WAKE_RE.test(text)) return null;
  return text
    .replace(WAKE_RE, " ")
    .replace(/^[,\s.:\-]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function shouldHandle(transcript) {
  const text = String(transcript || "").trim();
  if (!text || text.length < 2) return null;
  if (WAKE_RE.test(text)) {
    const after = extractAfterWake(text);
    return after || "__WAKE_ONLY__";
  }
  if (COMMAND_RE.test(text)) return text;
  return null;
}

function pauseMic() {
  try {
    wakeRecognition?.stop();
  } catch {
    // ignore
  }
}

function resumeMicSoon() {
  if (!wakeMode || muted) return;
  setTimeout(() => {
    if (!wakeMode || muted || busy) return;
    try {
      wakeRecognition.start();
      setOrb("listening");
      setState("Te escucho...");
    } catch {
      // already started
    }
  }, 350);
}

async function runVoiceCommand(text) {
  const value = String(text || "").trim();
  if (!value || busy) return;

  busy = true;
  pauseMic();
  stopAudio();
  showHeard(value);
  setOrb("thinking");
  setState("Ejecutando...");

  try {
    const result = await api("/api/command", {
      text: value,
      browserAudio: true,
      speak: false
    });

    if (result.ackAudioUrl) {
      setState(result.ack || "En eso...");
      await playAudioUrl(result.ackAudioUrl);
    }

    setState(result.say || "Listo.");
    if (result.audioUrl) {
      await playAudioUrl(result.audioUrl);
    }
  } catch (error) {
    const msg = "Se me trabó, bro. Prueba otra vez.";
    setState(msg);
    try {
      const fallback = await api("/api/speak", {
        text: msg,
        browserAudio: true
      });
      await playAudioUrl(fallback.audioUrl);
    } catch {
      // ignore
    }
  } finally {
    busy = false;
    if (wakeMode && !muted) {
      setOrb("listening");
      setState("Te escucho...");
      resumeMicSoon();
    } else {
      setOrb(muted ? "paused" : "idle");
    }
  }
}

function createRecognizer() {
  const rec = new SpeechRecognition();
  rec.lang = "es-MX";
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 3;
  return rec;
}

function stopListening() {
  wakeMode = false;
  muted = true;
  pauseMic();
  setOrb("paused");
  setState("En pausa. Toca el orbe para escuchar.");
}

function startListening() {
  if (!SpeechRecognition) {
    setState("Usa Chrome o Edge para el micrófono.");
    setOrb("paused");
    return;
  }

  muted = false;
  wakeMode = true;
  setOrb("listening");
  setState("Te escucho... di una orden");

  if (!wakeRecognition) {
    wakeRecognition = createRecognizer();

    wakeRecognition.onresult = (event) => {
      if (busy || muted) return;

      let finalText = "";
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const chunk = event.results[i][0]?.transcript || "";
        if (event.results[i].isFinal) finalText += `${chunk} `;
        else interimText += `${chunk} `;
      }

      const live = (finalText || interimText).trim();
      if (live) showHeard(live);
      if (!finalText.trim()) return;

      const decision = shouldHandle(finalText.trim());
      if (!decision) return;

      if (decision === "__WAKE_ONLY__") {
        setState("Dime...");
        pauseMic();
        api("/api/speak", { text: "Dime.", browserAudio: true })
          .then((r) => playAudioUrl(r.audioUrl))
          .finally(() => resumeMicSoon());
        return;
      }

      runVoiceCommand(decision);
    };

    wakeRecognition.onerror = (event) => {
      if (event.error === "not-allowed") {
        setState("Permiso de micrófono denegado.");
        stopListening();
      }
    };

    wakeRecognition.onend = () => {
      if (!wakeMode || muted || busy) return;
      setTimeout(() => {
        if (!wakeMode || muted || busy) return;
        try {
          wakeRecognition.start();
        } catch {
          // ignore
        }
      }, 250);
    };
  }

  try {
    wakeRecognition.start();
  } catch {
    // already running
  }
}

orbBtn.addEventListener("click", () => {
  if (wakeMode && !muted) stopListening();
  else startListening();
});

async function boot() {
  try {
    await api("/api/health");
  } catch {
    setState("No hay conexión con Jarvis.");
    setOrb("paused");
    return;
  }

  setOrb("speaking");
  setState("Saludando...");
  try {
    const greet = await api("/api/greeting");
    setState(greet.text);
    if (greet.audioUrl) await playAudioUrl(greet.audioUrl);
  } catch {
    // continue
  }

  startListening();
}

boot();
