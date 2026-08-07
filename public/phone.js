const statusEl = document.getElementById("status");
const replyEl = document.getElementById("reply");
const form = document.getElementById("form");
const input = document.getElementById("input");

async function api(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

async function sendCommand(text) {
  const value = String(text || "").trim();
  if (!value) return;
  statusEl.textContent = "Ejecutando en la PC...";
  replyEl.textContent = value;
  try {
    const result = await api("/api/command", {
      text: value,
      browserAudio: false,
      speak: true
    });
    replyEl.textContent = [result.ack, result.say].filter(Boolean).join(" — ");
    statusEl.textContent = result.action && result.action !== "none"
      ? `Acción: ${result.action}`
      : "Listo";
  } catch (error) {
    replyEl.textContent = error.message;
    statusEl.textContent = "Error";
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const value = input.value;
  input.value = "";
  sendCommand(value);
});

document.querySelectorAll(".modes [data-cmd]").forEach((btn) => {
  btn.addEventListener("click", () => sendCommand(btn.dataset.cmd));
});

fetch("/api/health")
  .then((r) => r.json())
  .then((h) => {
    statusEl.textContent = `Conectado a la PC de ${h.user}`;
  })
  .catch(() => {
    statusEl.textContent = "Sin conexión a Jarvis";
  });
