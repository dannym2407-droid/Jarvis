const orbBtn = document.getElementById("orbBtn");
const stateLine = document.getElementById("stateLine");
const heardLine = document.getElementById("heardLine");

let busy = false;
let wakeRecognition = null;
let wakeMode = false;
let muted = false;
let currentAudio = null;
let pushRecording = false;
let mediaStream = null;
let mediaRecorder = null;
let recChunks = [];

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const WAKE_RE =
  /\b((hey|oye|ok|okay|hola|ei|ey)\s+)?(jarvis|yarvis|jarviz|yarbis|jarbi|jarbis|harvey|jarves|llaves|yavis)\b/i;
const COMMAND_RE =
  /\b(abre|abrir|busca|buscar|google|escribe|mandale|manda|envia|enviale|cierra|cerrar|bloquea|captura|sube|baja|volumen|whatsapp|wasap|hora|fecha|cursor|chrome|visual|spotify|youtube|clima|tiempo|bateria|batería|anota|nota|chiste|papelera|descargas|escritorio|portapapeles|sistema|wifi|mapa|wikipedia|noticias|temporizador|timer|bitcoin|ethereum|gmail|netflix|tiktok|motiv|apag|reinic|dado|moneda|contraseña|password|camara|cámara|paint|procesos|define|carpeta|imagenes|imágenes|videos|aplicaciones|apps|briefing|modo|rutina|brillo|disco|traduce|archivo|nota|pendiente|recuerdame|avísame|avisame)\b/i;

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

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result || "");
      const b64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(b64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function transcribeBlob(blob) {
  const audioBase64 = await blobToBase64(blob);
  const data = await api("/api/transcribe", {
    audioBase64,
    mime: blob.type || "audio/webm"
  });
  return String(data.text || "").trim();
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
  // Con orbe activo, acepta casi cualquier frase final corta/media
  if (wakeMode && text.length >= 3 && text.length < 220) return text;
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
  if (!wakeMode || muted || pushRecording) return;
  setTimeout(() => {
    if (!wakeMode || muted || busy || pushRecording) return;
    try {
      wakeRecognition.start();
      setOrb("listening");
      setState("Te escucho... di Jarvis o una orden");
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
  setState("En pausa. Toca el orbe para escuchar · doble toque = grabar");
}

function startListening() {
  muted = false;
  wakeMode = true;
  setOrb("listening");
  setState("Te escucho... di una orden (o doble toque para grabar)");

  if (!SpeechRecognition) {
    setState("Sin Web Speech. Doble toque al orbe para grabar con Whisper.");
    return;
  }

  if (!wakeRecognition) {
    wakeRecognition = createRecognizer();

    wakeRecognition.onresult = (event) => {
      if (busy || muted || pushRecording) return;

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
        setState("Permiso de micrófono denegado. Permítelo en el navegador.");
        stopListening();
      } else if (event.error === "network") {
        setState("Mic en red falló. Doble toque para grabar con Whisper.");
      }
    };

    wakeRecognition.onend = () => {
      if (!wakeMode || muted || busy || pushRecording) return;
      setTimeout(() => {
        if (!wakeMode || muted || busy || pushRecording) return;
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

function pickMime() {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  for (const t of types) {
    if (window.MediaRecorder?.isTypeSupported?.(t)) return t;
  }
  return "";
}

async function startPushRecord() {
  if (busy || pushRecording) return;
  try {
    pauseMic();
    if (!mediaStream) {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true }
      });
    }
    recChunks = [];
    const mime = pickMime();
    mediaRecorder = mime ? new MediaRecorder(mediaStream, { mimeType: mime }) : new MediaRecorder(mediaStream);
    mediaRecorder.ondataavailable = (e) => {
      if (e.data?.size) recChunks.push(e.data);
    };
    mediaRecorder.start(200);
    pushRecording = true;
    setOrb("listening");
    setState("Grabando... toca otra vez para enviar");
  } catch (error) {
    setState("No pude abrir el micrófono. Revisa permisos.");
    console.warn(error);
  }
}

async function stopPushRecordAndSend() {
  if (!pushRecording || !mediaRecorder) return;
  pushRecording = false;
  setOrb("thinking");
  setState("Transcribiendo...");

  const blob = await new Promise((resolve) => {
    mediaRecorder.onstop = () => resolve(new Blob(recChunks, { type: mediaRecorder.mimeType || "audio/webm" }));
    try {
      mediaRecorder.stop();
    } catch {
      resolve(new Blob(recChunks, { type: "audio/webm" }));
    }
  });

  try {
    const text = await transcribeBlob(blob);
    if (!text) {
      setState("No entendí. Intenta otra vez.");
      resumeMicSoon();
      return;
    }
    await runVoiceCommand(text);
  } catch (error) {
    setState(error.message || "Falló la transcripción");
    resumeMicSoon();
  }
}

let lastTap = 0;
orbBtn.addEventListener("click", () => {
  const now = Date.now();
  const isDouble = now - lastTap < 380;
  lastTap = now;

  if (pushRecording) {
    stopPushRecordAndSend();
    return;
  }

  if (isDouble) {
    startPushRecord();
    return;
  }

  setTimeout(() => {
    if (Date.now() - lastTap < 360) return;
    if (pushRecording) return;
    if (wakeMode && !muted) stopListening();
    else startListening();
  }, 320);
});

async function boot() {
  try {
    await api("/api/health");
  } catch {
    setState("No hay conexión con Jarvis.");
    setOrb("paused");
    return;
  }

  // Pre-pedir micrófono (mejora Chrome)
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
  } catch {
    setState("Activa el micrófono del navegador para Jarvis.");
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
