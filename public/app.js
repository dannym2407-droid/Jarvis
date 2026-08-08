const orbBtn = document.getElementById("orbBtn");
const stateLine = document.getElementById("stateLine");
const heardLine = document.getElementById("heardLine");
const suggestLine = document.getElementById("suggestLine");
const textForm = document.getElementById("textForm");
const textInput = document.getElementById("textInput");

let busy = false;
let wakeRecognition = null;
let wakeMode = false;
let muted = false;
let currentAudio = null;
let networkFailCount = 0;
let armedUntil = 0; // ventana post "Hey Jarvis"

// Mic Whisper (Electron / fallback)
let mediaStream = null;
let mediaRecorder = null;
let recChunks = [];
let recording = false;
let vadTimer = null;
let speechSeen = false;
let silenceMs = 0;
let recordStartedAt = 0;
let audioCtx = null;
let analyser = null;
let vadRaf = null;

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const isElectronApp =
  Boolean(window.jarvisDesktop?.isElectron) || /Electron/i.test(navigator.userAgent || "");
// En Electron el reconocimiento de Google falla casi siempre → Whisper local + Groq
let useWhisperMic = isElectronApp || !SpeechRecognition;
const WAKE_RE =
  /\b((hey|oye|ok|okay|hola|ei|ey)\s+)?(jarvis|yarvis|jarviz|yarbis|jarbi|jarbis|harvey|jarves|llaves|yavis)\b/i;
const COMMAND_RE =
  /\b(abre|abrir|busca|buscar|google|escribe|mandale|manda|envia|enviale|cierra|cerrar|bloquea|captura|sube|baja|volumen|whatsapp|wasap|hora|fecha|cursor|chrome|visual|spotify|youtube|clima|tiempo|bateria|batería|anota|nota|chiste|papelera|descargas|escritorio|portapapeles|sistema|wifi|mapa|wikipedia|noticias|temporizador|timer|bitcoin|ethereum|gmail|netflix|tiktok|motiv|apag|reinic|dado|moneda|contraseña|password|camara|cámara|paint|procesos|define|carpeta|imagenes|imágenes|videos|aplicaciones|apps|briefing|modo|rutina|brillo|disco|traduce|archivo|pendiente|recuerdame|avisame|avísame|pon|quita|minimiza|maximiza|duerme|reinicia|apaga|git|commit|push|cambios|diagnost|radar|confirma|cancela|portafolio|portfolio|trabaja|proyecto|error|terminal|health|puertos|explica)\b/i;

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

function showSuggest(text) {
  if (!text) {
    suggestLine.hidden = true;
    suggestLine.textContent = "";
    return;
  }
  suggestLine.hidden = false;
  suggestLine.textContent = text;
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

async function ensureMicStream() {
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

function stopVad() {
  if (vadRaf) cancelAnimationFrame(vadRaf);
  vadRaf = null;
  clearTimeout(vadTimer);
  vadTimer = null;
  try {
    audioCtx?.close();
  } catch {
    // ignore
  }
  audioCtx = null;
  analyser = null;
}

function startVad(stream) {
  stopVad();
  speechSeen = false;
  silenceMs = 0;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const source = audioCtx.createMediaStreamSource(stream);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);
  const data = new Uint8Array(analyser.fftSize);
  let last = performance.now();

  const loop = () => {
    if (!recording || muted || busy) return;
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / data.length);
    const now = performance.now();
    const dt = now - last;
    last = now;

    // Umbral bajo: mics de laptop a veces dan RMS pequeño
    if (rms > 0.018) {
      speechSeen = true;
      silenceMs = 0;
      const lvl = Math.min(99, Math.round(rms * 400));
      setState(`Te escucho… (${lvl})`);
    } else if (speechSeen) {
      silenceMs += dt;
      if (silenceMs > 900) {
        stopWhisperTake();
        return;
      }
    } else if (Date.now() - recordStartedAt > 400) {
      setState("Mic ON · habla claro y pausa al terminar");
    }

    // máximo 12s por toma
    if (Date.now() - recordStartedAt > 12000) {
      stopWhisperTake();
      return;
    }
    vadRaf = requestAnimationFrame(loop);
  };
  vadRaf = requestAnimationFrame(loop);
}

async function startWhisperTake() {
  if (busy || recording || muted || !wakeMode) return;
  try {
    const stream = await ensureMicStream();
    recChunks = [];
    const mime = pickMime();
    mediaRecorder = mime
      ? new MediaRecorder(stream, { mimeType: mime })
      : new MediaRecorder(stream);
    mediaRecorder.ondataavailable = (e) => {
      if (e.data?.size) recChunks.push(e.data);
    };
    mediaRecorder.start(200);
    recording = true;
    recordStartedAt = Date.now();
    setOrb("listening");
    setState(isElectronApp ? "Mic ON · habla y pausa al terminar" : "Habla...");
    startVad(stream);
  } catch (error) {
    console.warn(error);
    setState("No pude abrir el micrófono. Revisa permisos de Windows.");
    setOrb("paused");
    wakeMode = false;
  }
}

async function stopWhisperTake() {
  if (!recording || !mediaRecorder) return;
  recording = false;
  stopVad();
  setOrb("thinking");
  setState("Entendiendo...");

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
  if (!speechSeen || elapsed < 500 || blob.size < 900) {
    if (wakeMode && !muted && !busy) {
      setOrb("listening");
      setState("No te oí. Habla otra vez...");
      setTimeout(() => startWhisperTake(), 350);
    }
    return;
  }

  try {
    const text = await transcribeBlob(blob);
    if (!text) {
      if (wakeMode && !muted) {
        setState("No entendí. Repite...");
        setTimeout(() => startWhisperTake(), 400);
      }
      return;
    }
    showHeard(text);

    // En app / Whisper: órdenes directas sin forzar "Hey Jarvis"
    let decision = shouldHandle(text);
    if (!decision && useWhisperMic && text.trim().length >= 3) {
      decision = text.trim();
    }
    if (!decision) {
      if (wakeMode && !muted) {
        setState("Escuchando...");
        setTimeout(() => startWhisperTake(), 400);
      }
      return;
    }
    if (decision === "__WAKE_ONLY__") {
      armedUntil = Date.now() + 15000;
      setState("Dime la orden...");
      if (wakeMode && !muted) setTimeout(() => startWhisperTake(), 300);
      return;
    }
    await runVoiceCommand(decision);
  } catch (error) {
    setState(error.message || "Falló el micrófono");
    if (wakeMode && !muted && !busy) setTimeout(() => startWhisperTake(), 800);
  }
}

function pauseMic() {
  try {
    wakeRecognition?.stop();
  } catch {
    // ignore
  }
  if (recording) {
    // no cortar a mitad de forma agresiva salvo busy
  }
}

function resumeMicSoon(delayMs = 400) {
  if (!wakeMode || muted) return;
  setTimeout(() => {
    if (!wakeMode || muted || busy) return;
    if (useWhisperMic) {
      startWhisperTake();
      return;
    }
    try {
      wakeRecognition.start();
      setOrb("listening");
      setState("Escuchando · di Hey Jarvis");
    } catch {
      // already started
    }
  }, delayMs);
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

  // Tras "Hey Jarvis", acepta la siguiente frase completa
  if (Date.now() < armedUntil && text.split(/\s+/).length >= 2) {
    return text;
  }

  if (COMMAND_RE.test(text)) return text;
  if (/^(si|sí|no|ok|dale|va|confirma|cancela)$/i.test(text)) return text;
  return null;
}

async function runVoiceCommand(text) {
  const value = String(text || "").trim();
  if (!value || busy) return;

  busy = true;
  armedUntil = 0;
  pauseMic();
  if (recording) {
    try {
      recording = false;
      stopVad();
      if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
    } catch {
      // ignore
    }
  }
  stopAudio();
  showHeard(value);
  setOrb("thinking");
  setState("Ejecutando...");

  try {
    const result = await api("/api/command", {
      text: value,
      browserAudio: true,
      speak: false,
      speakSystem: isElectronApp
    });

    if (result.ackAudioUrl) {
      setState(result.ack || "En eso...");
      await playAudioUrl(result.ackAudioUrl);
    }

    setState(result.say || "Listo.");
    // En Electron la voz sale por el sistema (se oye aunque estés en otra app)
    if (!isElectronApp) {
      if (result.audioUrl) {
        await playAudioUrl(result.audioUrl);
      } else if (result.say && window.speechSynthesis) {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(result.say);
        u.lang = "es-MX";
        window.speechSynthesis.speak(u);
      }
    } else if (result.say) {
      setState(result.say);
    }
  } catch {
    const msg = "Se me trabó, bro. Prueba otra vez.";
    setState(msg);
    try {
      const fallback = await api("/api/speak", { text: msg, browserAudio: true });
      if (fallback.audioUrl) await playAudioUrl(fallback.audioUrl);
      else if (window.speechSynthesis) {
        const u = new SpeechSynthesisUtterance(msg);
        u.lang = "es-MX";
        window.speechSynthesis.speak(u);
      }
    } catch {
      // ignore
    }
  } finally {
    busy = false;
    if (wakeMode && !muted) {
      setOrb("listening");
      setState(useWhisperMic ? "Mic ON · habla tu orden" : "Escuchando · di Hey Jarvis");
      resumeMicSoon(500);
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
  armedUntil = 0;
  pauseMic();
  recording = false;
  stopVad();
  try {
    if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
  } catch {
    // ignore
  }
  setOrb("paused");
  setState("En pausa. Toca el orbe para escuchar otra vez.");
}

function startListening() {
  muted = false;
  wakeMode = true;
  networkFailCount = 0;
  setOrb("listening");

  if (useWhisperMic) {
    setState("Mic ON · habla y pausa al terminar");
    startWhisperTake();
    return;
  }

  if (!SpeechRecognition) {
    setState("Mic no disponible. Usa la app desktop o Chrome.");
    setOrb("paused");
    return;
  }

  setState("Escuchando · di Hey Jarvis");

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

      networkFailCount = 0;
      const decision = shouldHandle(finalText.trim());
      if (!decision) return;

      if (decision === "__WAKE_ONLY__") {
        armedUntil = Date.now() + 12000;
        setState("Dime...");
        pauseMic();
        api("/api/speak", { text: "Dime.", browserAudio: true })
          .then((r) => playAudioUrl(r.audioUrl))
          .finally(() => resumeMicSoon(450));
        return;
      }

      runVoiceCommand(decision);
    };

    wakeRecognition.onerror = (event) => {
      const err = event.error || "";
      if (err === "not-allowed") {
        setState("Permiso de micrófono denegado.");
        stopListening();
        return;
      }
      if (err === "network" || err === "service-not-allowed" || err === "audio-capture") {
        networkFailCount += 1;
        if (networkFailCount >= 2) {
          setState("Pasando a mic local (Whisper)...");
          window.__jarvisForceWhisper = true;
          useWhisperMic = true;
          try {
            wakeRecognition?.stop();
          } catch {
            // ignore
          }
          startWhisperTake();
        }
      }
    };

    wakeRecognition.onend = () => {
      if (!wakeMode || muted || busy) return;
      if (window.__jarvisForceWhisper || useWhisperMic) return;
      const wait = networkFailCount > 2 ? 900 : 280;
      setTimeout(() => {
        if (!wakeMode || muted || busy) return;
        try {
          wakeRecognition.start();
        } catch {
          // ignore
        }
      }, wait);
    };
  }

  try {
    wakeRecognition.start();
  } catch {
    // already running
  }
}

function setBar(id, valId, pct) {
  const bar = document.getElementById(id);
  const label = document.getElementById(valId);
  const n = Math.max(0, Math.min(100, Number(pct) || 0));
  if (bar) bar.style.width = `${n}%`;
  if (label) label.textContent = `${n}%`;
}

function renderRadar(data) {
  if (!data) return;
  setBar("cpuBar", "cpuVal", data.cpu);
  setBar("ramBar", "ramVal", data.ram);
  setBar("diskBar", "diskVal", data.disk);
  const project = document.getElementById("projectName");
  if (project) project.textContent = data.project || "—";
  const fg = document.getElementById("fgLine");
  if (fg) fg.textContent = `Foco: ${data.foreground || "—"}`;
  const git = document.getElementById("gitLine");
  if (git) {
    if (!data.git) git.textContent = "Git: —";
    else if (!data.git.dirty) git.textContent = `Git: limpio (${data.git.branch || "?"})`;
    else {
      git.textContent = `Git: ${data.git.files?.length || "?"} cambio(s) · ${data.git.branch || ""}`;
    }
  }
  document.querySelectorAll("#services i[data-k]").forEach((el) => {
    const key = el.getAttribute("data-k");
    el.classList.toggle("on", Boolean(data.services?.[key]));
  });
}

async function refreshRadar() {
  try {
    const data = await api("/api/radar");
    renderRadar(data);
  } catch {
    // ignore
  }
}

function connectEvents() {
  try {
    const es = new EventSource("/api/events");
    es.onmessage = async (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "radar" && msg.data) renderRadar(msg.data);
        if (msg.type === "proactive" && msg.text) {
          showSuggest(msg.text);
          setState(msg.text);
          if (msg.audioUrl && !busy) await playAudioUrl(msg.audioUrl);
        }
      } catch {
        // ignore
      }
    };
  } catch {
    // ignore
  }
}

orbBtn.addEventListener("click", () => {
  if (wakeMode && !muted) stopListening();
  else startListening();
});

textForm?.addEventListener("submit", (e) => {
  e.preventDefault();
  const value = textInput.value.trim();
  if (!value || busy) return;
  textInput.value = "";
  runVoiceCommand(value);
});

async function boot() {
  try {
    await api("/api/health");
  } catch {
    setState("No hay conexión con Jarvis. Corre start-app.bat o start.bat");
    setOrb("paused");
    return;
  }

  if (isElectronApp) {
    useWhisperMic = true;
    const badge = document.getElementById("appBadge");
    if (badge) badge.hidden = false;
    const hint = document.querySelector(".hint");
    if (hint) {
      hint.innerHTML =
        "Habla tu orden y <strong>pausa ~1s</strong> · orbe pausa · <strong>Ctrl+Shift+J</strong>";
    }
    window.jarvisDesktop?.onToggleListen?.(() => {
      if (wakeMode && !muted) stopListening();
      else startListening();
    });
  }

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
  } catch (err) {
    console.warn(err);
    setState("Windows bloqueó el mic. Privacidad → Micrófono → permitir apps de escritorio.");
    setOrb("paused");
    return;
  }

  connectEvents();
  refreshRadar();
  setInterval(refreshRadar, 20000);

  setOrb("speaking");
  setState("Saludando...");
  try {
    const greet = await api("/api/greeting");
    setState(greet.text);
    // En Electron el saludo ya suena por el servidor
    if (!isElectronApp) {
      if (greet.audioUrl) await playAudioUrl(greet.audioUrl);
      else if (greet.text && window.speechSynthesis) {
        const u = new SpeechSynthesisUtterance(greet.text);
        u.lang = "es-MX";
        window.speechSynthesis.speak(u);
      }
    }
  } catch {
    // continue
  }

  startListening();
}

boot();
