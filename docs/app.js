const messagesEl = document.getElementById("messages");
const form = document.getElementById("form");
const input = document.getElementById("input");
const micBtn = document.getElementById("micBtn");
const voiceStatus = document.getElementById("voiceStatus");
const settingsBtn = document.getElementById("settingsBtn");
const settings = document.getElementById("settings");
const apiKeyInput = document.getElementById("apiKey");
const userNameInput = document.getElementById("userName");
const saveBtn = document.getElementById("saveBtn");
const statusLine = document.getElementById("statusLine");

const KEYS = {
  api: "jarvis_phone_groq",
  name: "jarvis_phone_name",
  history: "jarvis_phone_history",
  notes: "jarvis_phone_notes"
};

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let busy = false;
let history = [];

function loadConfig() {
  apiKeyInput.value = localStorage.getItem(KEYS.api) || "";
  userNameInput.value = localStorage.getItem(KEYS.name) || "Cristopher";
  try {
    history = JSON.parse(localStorage.getItem(KEYS.history) || "[]");
    if (!Array.isArray(history)) history = [];
  } catch {
    history = [];
  }
}

function saveConfig() {
  localStorage.setItem(KEYS.api, apiKeyInput.value.trim());
  localStorage.setItem(KEYS.name, userNameInput.value.trim() || "Cristopher");
  statusLine.textContent = `Hola ${localStorage.getItem(KEYS.name)} · listo`;
}

function persistHistory() {
  localStorage.setItem(KEYS.history, JSON.stringify(history.slice(-24)));
}

function addMessage(role, text) {
  const div = document.createElement("div");
  div.className = `msg ${role === "user" ? "user" : "bot"}`;
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function speak(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "es-MX";
  const voices = window.speechSynthesis.getVoices();
  const preferred =
    voices.find((v) => /es/i.test(v.lang) && /male|jorge|diego|pablo|david| ent/i.test(v.name)) ||
    voices.find((v) => /es-MX|es-US|es-ES/i.test(v.lang)) ||
    voices.find((v) => /es/i.test(v.lang));
  if (preferred) u.voice = preferred;
  window.speechSynthesis.speak(u);
}

function openUrl(url) {
  window.location.href = url;
}

function getNotes() {
  try {
    const notes = JSON.parse(localStorage.getItem(KEYS.notes) || "[]");
    return Array.isArray(notes) ? notes : [];
  } catch {
    return [];
  }
}

function saveNote(text) {
  const notes = getNotes();
  notes.push({ at: new Date().toISOString(), text });
  localStorage.setItem(KEYS.notes, JSON.stringify(notes.slice(-40)));
}

/**
 * Acciones nativas del teléfono (sin PC).
 */
function matchPhoneCommand(raw) {
  const t = String(raw || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/^(hey|oye|ok|hola)\s+jarvis[,:]?\s*/i, "")
    .trim();

  if (!t) return { handled: true, say: "Te escucho. ¿Qué necesitas?" };

  if (/que hora|hora es/.test(t)) {
    const clock = new Date().toLocaleTimeString("es-GT", { hour: "2-digit", minute: "2-digit" });
    return { handled: true, say: `Son las ${clock}.` };
  }
  if (/que dia|que fecha|fecha de hoy/.test(t)) {
    const date = new Date().toLocaleDateString("es-GT", { dateStyle: "full" });
    return { handled: true, say: `Hoy es ${date}.` };
  }
  if (/motivame|motivacion|animo/.test(t)) {
    const lines = [
      "Bro, hoy también se puede. Un paso a la vez.",
      "No tienes que ser perfecto, solo constante.",
      "Menos overthinking, más acción. Tú puedes."
    ];
    return { handled: true, say: lines[Math.floor(Math.random() * lines.length)] };
  }
  if (/chiste|hazme reir/.test(t)) {
    const jokes = [
      "¿Por qué el teléfono fue al psicólogo? Porque tenía muchos issues sin resolver.",
      "No estoy ocupado, estoy en modo bajo consumo social.",
      "Mi batería y yo tenemos la misma motivación: 1%."
    ];
    return { handled: true, say: jokes[Math.floor(Math.random() * jokes.length)] };
  }

  const note = t.match(/(?:anota|recuerda|nota)\s+(.+)$/);
  if (note) {
    saveNote(note[1].trim());
    return { handled: true, say: "Listo, lo anoté en tu teléfono." };
  }
  if (/mis notas|que anote|qué anoté|leer notas/.test(t)) {
    const notes = getNotes().slice(-3).map((n) => n.text);
    return {
      handled: true,
      say: notes.length ? `Tus últimas notas: ${notes.join("; ")}.` : "Aún no tienes notas."
    };
  }

  if (/abre whatsapp|abrir whatsapp/.test(t)) {
    openUrl("https://wa.me/");
    return { handled: true, say: "Abriendo WhatsApp." };
  }
  if (/abre (youtube|you tube)/.test(t)) {
    openUrl("https://www.youtube.com");
    return { handled: true, say: "Abriendo YouTube." };
  }
  if (/abre (maps|mapas|google maps)/.test(t)) {
    openUrl("https://maps.google.com");
    return { handled: true, say: "Abriendo mapas." };
  }
  if (/abre (gmail|correo)/.test(t)) {
    openUrl("https://mail.google.com");
    return { handled: true, say: "Abriendo Gmail." };
  }
  if (/abre (instagram|insta)/.test(t)) {
    openUrl("https://www.instagram.com");
    return { handled: true, say: "Abriendo Instagram." };
  }
  if (/abre (tiktok|tik tok)/.test(t)) {
    openUrl("https://www.tiktok.com");
    return { handled: true, say: "Abriendo TikTok." };
  }
  if (/abre (camera|camara|cámara)/.test(t)) {
    // No hay API universal; abrimos búsqueda de cámara no aplica. Mejor decir que use el botón.
    return { handled: true, say: "Para la cámara usa el ícono de Cámara de tu teléfono." };
  }

  const call = t.match(/(?:llama|llamar|marca)\s+(?:a\s+)?(.+)$/);
  if (call) {
    const who = call[1].replace(/\s+/g, "");
    if (/\d{8,}/.test(who.replace(/\D/g, ""))) {
      openUrl(`tel:${who.replace(/\D/g, "")}`);
      return { handled: true, say: "Listo, abro la llamada." };
    }
    return { handled: true, say: "Dime el número, por ejemplo: llama al 50212345678." };
  }

  const sms = t.match(/(?:mensaje|sms|escribele|enviale)\s+(?:a\s+)?(\+?\d[\d\s-]{7,})\s+(?:que|dile|:)\s*(.+)$/);
  if (sms) {
    const num = sms[1].replace(/\D/g, "");
    openUrl(`sms:${num}?body=${encodeURIComponent(sms[2])}`);
    return { handled: true, say: "Te abrí el mensaje para enviarlo." };
  }

  const wa =
    t.match(/(?:whatsapp|wasap)\s+(?:a\s+)?(.+?)\s*:\s*(.+)$/) ||
    t.match(/(?:mandale|enviale|escribele)\s+(?:a\s+)?(.+?)\s+por\s+whatsapp\s+(?:que\s+)?(.+)$/);
  if (wa) {
    const maybePhone = wa[1].replace(/\D/g, "");
    if (maybePhone.length >= 8) {
      openUrl(`https://wa.me/${maybePhone}?text=${encodeURIComponent(wa[2])}`);
      return { handled: true, say: "Abrí WhatsApp con el mensaje." };
    }
    openUrl(`https://wa.me/?text=${encodeURIComponent(`${wa[1]}: ${wa[2]}`)}`);
    return { handled: true, say: "Abrí WhatsApp. Elige el contacto y envía." };
  }

  const maps = t.match(/(?:como llegar|cómo llegar|mapa|ubicacion|ubicación|llevame|llévame)\s+(?:a\s+)?(.+)$/);
  if (maps) {
    openUrl(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(maps[1])}`);
    return { handled: true, say: `Busco ${maps[1]} en el mapa.` };
  }

  const search =
    t.match(/^(?:busca|buscar|google|googlea)\s+(.+)$/) ||
    t.match(/^(?:clima|tiempo)\s+(?:en\s+)?(.+)$/);
  if (search) {
    const q = /^(clima|tiempo)/.test(t) ? `clima ${search[1]}` : search[1];
    openUrl(`https://www.google.com/search?q=${encodeURIComponent(q)}`);
    return { handled: true, say: `Busco ${q}.` };
  }

  const yt = t.match(/(?:youtube|en youtube)\s+(?:busca\s+)?(.+)$/);
  if (yt) {
    openUrl(`https://www.youtube.com/results?search_query=${encodeURIComponent(yt[1])}`);
    return { handled: true, say: "Lo busco en YouTube." };
  }

  return null;
}

async function askGroq(text) {
  const key = localStorage.getItem(KEYS.api) || "";
  const name = localStorage.getItem(KEYS.name) || "Cristopher";
  if (!key) throw new Error("Falta tu Groq API Key. Toca ⚙ y pégala (gratis en console.groq.com).");

  const system = `Eres Jarvis, el asistente personal del TELÉFONO de ${name}.
NO controlas una laptop. Ayudas en el celular: consejos, ideas, organización, humor, explicaciones.
Español cercano y suelto (guatemalteco informal ok). 1 a 3 oraciones para voz.
Si piden controlar la PC, di que este Jarvis es del teléfono; el de la laptop es aparte.
Fecha: ${new Date().toLocaleString("es-GT")}.`;

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      temperature: 0.9,
      max_tokens: 420,
      messages: [
        { role: "system", content: system },
        ...history.slice(-12),
        { role: "user", content: text }
      ]
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq ${res.status}: ${err.slice(0, 160)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || "No te escuché bien.";
}

async function handleUserText(text) {
  const value = String(text || "").trim();
  if (!value || busy) return;
  busy = true;
  addMessage("user", value);
  input.value = "";
  statusLine.textContent = "Pensando...";

  try {
    const local = matchPhoneCommand(value);
    let reply;
    if (local?.handled) {
      reply = local.say;
    } else {
      reply = await askGroq(value);
      history.push({ role: "user", content: value });
      history.push({ role: "assistant", content: reply });
      persistHistory();
    }
    addMessage("assistant", reply);
    speak(reply);
    statusLine.textContent = `Hola ${localStorage.getItem(KEYS.name) || "bro"} · listo`;
  } catch (error) {
    addMessage("assistant", error.message);
    statusLine.textContent = "Error";
  } finally {
    busy = false;
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  handleUserText(input.value);
});

document.querySelectorAll(".chips [data-cmd]").forEach((btn) => {
  btn.addEventListener("click", () => handleUserText(btn.dataset.cmd));
});

settingsBtn.addEventListener("click", () => {
  loadConfig();
  settings.showModal();
});

saveBtn.addEventListener("click", () => {
  saveConfig();
});

function setupMic() {
  if (!SpeechRecognition) {
    micBtn.disabled = true;
    micBtn.title = "Micrófono no soportado en este navegador";
    return;
  }
  recognition = new SpeechRecognition();
  recognition.lang = "es-MX";
  recognition.interimResults = false;
  recognition.onstart = () => {
    micBtn.classList.add("listening");
    voiceStatus.hidden = false;
  };
  recognition.onend = () => {
    micBtn.classList.remove("listening");
    voiceStatus.hidden = true;
  };
  recognition.onerror = () => {
    micBtn.classList.remove("listening");
    voiceStatus.hidden = true;
  };
  recognition.onresult = (event) => {
    const text = event.results?.[0]?.[0]?.transcript || "";
    if (text) handleUserText(text);
  };
  micBtn.addEventListener("click", () => {
    try {
      recognition.start();
    } catch {
      // ignore
    }
  });
}

loadConfig();
setupMic();
window.speechSynthesis?.getVoices?.();
statusLine.textContent = localStorage.getItem(KEYS.api)
  ? `Hola ${localStorage.getItem(KEYS.name) || ""} · listo`.trim()
  : "Configura tu API key ⚙";

addMessage(
  "assistant",
  `Qué onda${localStorage.getItem(KEYS.name) ? `, ${localStorage.getItem(KEYS.name)}` : ""}. Soy tu Jarvis del teléfono. Habla o escribe: buscar, WhatsApp, mapas, notas, motivación...`
);

if (!localStorage.getItem(KEYS.api)) settings.showModal();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
