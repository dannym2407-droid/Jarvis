const messagesEl = document.getElementById("messages");
const form = document.getElementById("composer");
const input = document.getElementById("input");
const micBtn = document.getElementById("micBtn");
const clearBtn = document.getElementById("clearBtn");
const voiceStatus = document.getElementById("voiceStatus");
const voiceStatusText = document.getElementById("voiceStatusText");
const statusLine = document.getElementById("statusLine");

let busy = false;
let recognition = null;
let listening = false;

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

function addMessage(role, text) {
  const div = document.createElement("div");
  div.className = `msg ${role}`;
  div.innerHTML = `<span class="meta">${role === "user" ? "Tú" : "Jarvis"}</span><div></div>`;
  div.querySelector("div").textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
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

async function sendCommand(text) {
  const value = String(text || "").trim();
  if (!value || busy) return;
  busy = true;
  addMessage("user", value);
  input.value = "";
  statusLine.textContent = "Pensando...";
  try {
    const result = await api("/api/command", { text: value, speak: true });
    addMessage("assistant", result.say || "Listo.");
    statusLine.textContent = result.action && result.action !== "none"
      ? `Acción: ${result.action}`
      : "En línea";
  } catch (error) {
    addMessage("assistant", `Error: ${error.message}`);
    statusLine.textContent = "Error";
  } finally {
    busy = false;
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  sendCommand(input.value);
});

clearBtn.addEventListener("click", async () => {
  await api("/api/clear", {});
  messagesEl.innerHTML = "";
  addMessage("assistant", "Chat limpio. ¿Qué sigue?");
});

document.querySelectorAll(".hints [data-cmd]").forEach((btn) => {
  btn.addEventListener("click", () => sendCommand(btn.dataset.cmd));
});

function setListening(on) {
  listening = on;
  micBtn.classList.toggle("listening", on);
  voiceStatus.hidden = !on;
  voiceStatusText.textContent = on ? "Te escucho..." : "";
}

function setupMic() {
  if (!SpeechRecognition) {
    micBtn.title = "Tu navegador no soporta reconocimiento de voz";
    micBtn.disabled = true;
    return;
  }
  recognition = new SpeechRecognition();
  recognition.lang = "es-GT";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => setListening(true);
  recognition.onend = () => setListening(false);
  recognition.onerror = () => setListening(false);
  recognition.onresult = (event) => {
    const text = event.results?.[0]?.[0]?.transcript || "";
    if (text) sendCommand(text);
  };

  micBtn.addEventListener("click", () => {
    if (listening) {
      recognition.stop();
      return;
    }
    recognition.start();
  });
}

async function bootUi() {
  try {
    const health = await api("/api/health");
    statusLine.textContent = health.groq
      ? `Hola ${health.user} · Groq OK`
      : `Hola ${health.user} · falta GROQ_API_KEY`;
    const greet = await api("/api/greeting");
    addMessage("assistant", greet.text);
  } catch {
    statusLine.textContent = "Sin conexión al servidor";
    addMessage("assistant", "No pude conectar con el servidor local.");
  }
  setupMic();
  input.focus();
}

bootUi();
