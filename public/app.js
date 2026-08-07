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

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
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

function pauseMic() {
  try {
    wakeRecognition?.stop();
  } catch {
    // ignore
  }
}

function resumeMicSoon(delayMs = 400) {
  if (!wakeMode || muted) return;
  setTimeout(() => {
    if (!wakeMode || muted || busy) return;
    try {
      wakeRecognition.start();
      setOrb("listening");
      setState(Date.now() < armedUntil ? "Dime la orden..." : "Escuchando · di Hey Jarvis");
    } catch {
      // already started
    }
  }, delayMs);
}

async function runVoiceCommand(text) {
  const value = String(text || "").trim();
  if (!value || busy) return;

  busy = true;
  armedUntil = 0;
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
    } else if (result.say && window.speechSynthesis) {
      // Fallback rápido si el TTS del server tarda
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(result.say);
      u.lang = "es-MX";
      window.speechSynthesis.speak(u);
    }
  } catch {
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
    if (wakeMode && !muted) {
      setOrb("listening");
      setState("Escuchando · di Hey Jarvis");
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
  setOrb("paused");
  setState("En pausa. Toca el orbe para escuchar otra vez.");
}

function startListening() {
  if (!SpeechRecognition) {
    setState("Usa Chrome o Edge para voz continua.");
    setOrb("paused");
    return;
  }

  muted = false;
  wakeMode = true;
  networkFailCount = 0;
  setOrb("listening");
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
        setState("Permiso de micrófono denegado. Actívalo en Chrome y recarga.");
        stopListening();
        return;
      }
      if (err === "network") {
        networkFailCount += 1;
        if (networkFailCount >= 10) {
          setState("Mic online inestable. Toca el orbe para reintentar.");
          stopListening();
        }
      }
    };

    wakeRecognition.onend = () => {
      if (!wakeMode || muted || busy) return;
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

  if (window.jarvisDesktop?.isElectron) {
    const badge = document.getElementById("appBadge");
    if (badge) badge.hidden = false;
    window.jarvisDesktop.onToggleListen(() => {
      if (wakeMode && !muted) stopListening();
      else startListening();
    });
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
  } catch {
    setState("Activa el micrófono para Jarvis.");
  }

  connectEvents();
  refreshRadar();
  setInterval(refreshRadar, 20000);

  setOrb("speaking");
  setState("Saludando...");
  try {
    const greet = await api("/api/greeting");
    setState(greet.text);
    if (greet.audioUrl) await playAudioUrl(greet.audioUrl);
    else if (greet.text && window.speechSynthesis) {
      const u = new SpeechSynthesisUtterance(greet.text);
      u.lang = "es-MX";
      window.speechSynthesis.speak(u);
    }
  } catch {
    // continue
  }

  startListening();
}

boot();
