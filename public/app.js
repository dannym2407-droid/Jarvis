const orbBtn = document.getElementById("orbBtn");
const stateLine = document.getElementById("stateLine");
const heardLine = document.getElementById("heardLine");
const textForm = document.getElementById("textForm");
const textInput = document.getElementById("textInput");

let busy = false;
let currentAudio = null;
let recording = false;
let mediaStream = null;
let mediaRecorder = null;
let recChunks = [];
let recordStartedAt = 0;
let autoStopTimer = null;

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
      resolve(result.includes(",") ? result.split(",")[1] : result);
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

function pickMime() {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  for (const t of types) {
    if (window.MediaRecorder?.isTypeSupported?.(t)) return t;
  }
  return "";
}

async function runVoiceCommand(text) {
  const value = String(text || "").trim();
  if (!value || busy) return;

  busy = true;
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
    if (result.audioUrl) await playAudioUrl(result.audioUrl);
  } catch (error) {
    const msg = "Se me trabó, bro. Prueba otra vez.";
    setState(msg);
    try {
      const fallback = await api("/api/speak", { text: msg, browserAudio: true });
      await playAudioUrl(fallback.audioUrl);
    } catch {
      // ignore
    }
  } finally {
    busy = false;
    setOrb("idle");
    setState("Toca el orbe, habla, toca otra vez");
  }
}

async function ensureMic() {
  if (mediaStream) {
    const live = mediaStream.getTracks().some((t) => t.readyState === "live");
    if (live) return mediaStream;
  }
  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    }
  });
  return mediaStream;
}

async function startRecording() {
  if (busy || recording) return;
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    setState("Este navegador no puede grabar. Usa Chrome o Edge.");
    return;
  }

  try {
    const stream = await ensureMic();
    recChunks = [];
    const mime = pickMime();
    mediaRecorder = mime
      ? new MediaRecorder(stream, { mimeType: mime })
      : new MediaRecorder(stream);

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) recChunks.push(e.data);
    };

    mediaRecorder.start(250);
    recording = true;
    recordStartedAt = Date.now();
    setOrb("listening");
    setState("Escuchando... habla y toca otra vez para enviar");
    showHeard("");

    clearTimeout(autoStopTimer);
    autoStopTimer = setTimeout(() => {
      if (recording) stopRecordingAndSend();
    }, 20000);
  } catch (error) {
    const denied = /NotAllowed|Permission|Denied/i.test(String(error.name || error.message || ""));
    setState(
      denied
        ? "Activa el micrófono en Chrome (candado → Micrófono → Permitir) y recarga."
        : `No pude abrir el mic: ${error.message || error}`
    );
    setOrb("paused");
  }
}

async function stopRecordingAndSend() {
  clearTimeout(autoStopTimer);
  if (!recording || !mediaRecorder) return;
  recording = false;
  setOrb("thinking");
  setState("Entendiendo lo que dijiste...");

  const blob = await new Promise((resolve) => {
    mediaRecorder.onstop = () => {
      resolve(new Blob(recChunks, { type: mediaRecorder.mimeType || "audio/webm" }));
    };
    try {
      if (mediaRecorder.state !== "inactive") mediaRecorder.stop();
      else resolve(new Blob(recChunks, { type: "audio/webm" }));
    } catch {
      resolve(new Blob(recChunks, { type: "audio/webm" }));
    }
  });

  const elapsed = Date.now() - recordStartedAt;
  if (elapsed < 450 || blob.size < 600) {
    setOrb("idle");
    setState("Muy corto. Toca, habla 1–2 segundos, toca otra vez.");
    return;
  }

  try {
    const text = await transcribeBlob(blob);
    if (!text) {
      setOrb("idle");
      setState("No te escuché. Intenta otra vez más cerca.");
      return;
    }
    await runVoiceCommand(text);
  } catch (error) {
    setOrb("paused");
    setState(
      /GROQ|API|401|403/i.test(String(error.message || ""))
        ? "Falta o falló GROQ_API_KEY en tu .env — sin eso no puedo transcribir."
        : error.message || "Falló la transcripción"
    );
  }
}

orbBtn.addEventListener("click", () => {
  if (busy) return;
  if (recording) stopRecordingAndSend();
  else startRecording();
});

textForm?.addEventListener("submit", (e) => {
  e.preventDefault();
  const value = textInput.value.trim();
  if (!value || busy || recording) return;
  textInput.value = "";
  runVoiceCommand(value);
});

async function boot() {
  try {
    await api("/api/health");
  } catch {
    setState("No hay conexión con Jarvis. Corre start.bat");
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

  setOrb("idle");
  setState("Toca el orbe, habla, toca otra vez");
}

boot();
