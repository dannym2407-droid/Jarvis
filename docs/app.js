const messagesEl = document.getElementById("messages");
const form = document.getElementById("form");
const input = document.getElementById("input");
const micBtn = document.getElementById("micBtn");
const voiceStatus = document.getElementById("voiceStatus");
const settingsBtn = document.getElementById("settingsBtn");
const settings = document.getElementById("settings");
const apiKeyInput = document.getElementById("apiKey");
const userNameInput = document.getElementById("userName");
const contactsInput = document.getElementById("contacts");
const saveBtn = document.getElementById("saveBtn");
const statusLine = document.getElementById("statusLine");

const KEYS = {
  api: "jarvis_phone_groq",
  name: "jarvis_phone_name",
  history: "jarvis_phone_history",
  notes: "jarvis_phone_notes",
  contacts: "jarvis_phone_contacts",
  todos: "jarvis_phone_todos",
  memory: "jarvis_phone_memory",
  reminders: "jarvis_phone_reminders"
};

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let busy = false;
let history = [];
const activeTimers = new Map();

function loadJson(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "null");
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function loadConfig() {
  apiKeyInput.value = localStorage.getItem(KEYS.api) || "";
  userNameInput.value = localStorage.getItem(KEYS.name) || "Cristopher";
  if (contactsInput) {
    const contacts = loadJson(KEYS.contacts, {});
    contactsInput.value = Object.entries(contacts)
      .map(([n, p]) => `${n}: ${p}`)
      .join("\n");
  }
  history = loadJson(KEYS.history, []);
  if (!Array.isArray(history)) history = [];
}

function parseContactsText(text) {
  const map = {};
  String(text || "")
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .forEach((line) => {
      const m = line.match(/^(.+?)[:\-=]\s*(.+)$/);
      if (m) map[m[1].trim().toLowerCase()] = m[2].replace(/\D/g, "");
    });
  return map;
}

function saveConfig() {
  localStorage.setItem(KEYS.api, apiKeyInput.value.trim());
  localStorage.setItem(KEYS.name, userNameInput.value.trim() || "Cristopher");
  if (contactsInput) saveJson(KEYS.contacts, parseContactsText(contactsInput.value));
  statusLine.textContent = `Hola ${localStorage.getItem(KEYS.name)} · listo`;
}

function persistHistory() {
  saveJson(KEYS.history, history.slice(-24));
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
  window.open(url, "_blank", "noopener,noreferrer") || (window.location.href = url);
}

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function getNotes() {
  const notes = loadJson(KEYS.notes, []);
  return Array.isArray(notes) ? notes : [];
}

function saveNote(text) {
  const notes = getNotes();
  notes.push({ at: new Date().toISOString(), text });
  saveJson(KEYS.notes, notes.slice(-40));
}

function getTodos() {
  const todos = loadJson(KEYS.todos, []);
  return Array.isArray(todos) ? todos : [];
}

function getMemory() {
  const mem = loadJson(KEYS.memory, []);
  return Array.isArray(mem) ? mem : [];
}

function getContacts() {
  const c = loadJson(KEYS.contacts, {});
  return c && typeof c === "object" ? c : {};
}

function resolveContact(name) {
  const contacts = getContacts();
  const key = norm(name).trim();
  if (contacts[key]) return contacts[key];
  const hit = Object.keys(contacts).find((k) => key.includes(k) || k.includes(key));
  return hit ? contacts[hit] : null;
}

function notify(title, body) {
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") {
    new Notification(title, { body, icon: "./icon.svg" });
  } else if (Notification.permission !== "denied") {
    Notification.requestPermission().then((p) => {
      if (p === "granted") new Notification(title, { body, icon: "./icon.svg" });
    });
  }
  try {
    navigator.vibrate?.([200, 100, 200]);
  } catch {
    /* ignore */
  }
}

function scheduleReminder(seconds, label) {
  const id = `r_${Date.now()}`;
  const when = Date.now() + seconds * 1000;
  const list = loadJson(KEYS.reminders, []);
  list.push({ id, when, label });
  saveJson(KEYS.reminders, list.slice(-20));
  const handle = setTimeout(() => {
    const msg = `Recordatorio: ${label}`;
    addMessage("assistant", msg);
    speak(msg);
    notify("Jarvis", msg);
    activeTimers.delete(id);
    saveJson(
      KEYS.reminders,
      loadJson(KEYS.reminders, []).filter((r) => r.id !== id)
    );
  }, seconds * 1000);
  activeTimers.set(id, handle);
  return { id, seconds, label };
}

async function fetchWeather(city = "Guatemala") {
  const res = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`);
  if (!res.ok) throw new Error("clima");
  const data = await res.json();
  const cur = data.current_condition?.[0];
  const area = data.nearest_area?.[0]?.areaName?.[0]?.value || city;
  const temp = cur?.temp_C;
  const desc = cur?.lang_es?.[0]?.value || cur?.weatherDesc?.[0]?.value || "";
  const feels = cur?.FeelsLikeC;
  return `En ${area}: ${temp}°C, ${desc}. Se siente como ${feels}°C.`;
}

async function fetchCrypto(symbol = "bitcoin") {
  const map = { btc: "bitcoin", eth: "ethereum", sol: "solana", doge: "dogecoin", bitcoin: "bitcoin", ethereum: "ethereum", solana: "solana" };
  const id = map[norm(symbol)] || "bitcoin";
  const res = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd,gtq`
  );
  const data = await res.json();
  const row = data[id];
  if (!row) throw new Error("crypto");
  return `${id}: $${row.usd} USD` + (row.gtq ? ` · Q${row.gtq}` : "");
}

async function fetchExchange(amount, from, to) {
  const res = await fetch(`https://open.er-api.com/v6/latest/${from}`);
  const data = await res.json();
  const rate = data?.rates?.[to];
  if (!rate) throw new Error("fx");
  return `${amount} ${from} ≈ ${(amount * rate).toFixed(2)} ${to}`;
}

async function fetchWiki(query) {
  const search = await fetch(
    `https://es.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=1&namespace=0&format=json&origin=*`
  );
  const arr = await search.json();
  const title = arr?.[1]?.[0];
  if (!title) return null;
  const page = await fetch(
    `https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
  );
  const data = await page.json();
  return String(data?.extract || "").slice(0, 380);
}

async function fetchTranslate(text, to = "en") {
  const pair = to === "es" ? "en|es" : "es|en";
  const res = await fetch(
    `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${pair}`
  );
  const data = await res.json();
  return data?.responseData?.translatedText || null;
}

function calcExpr(expr) {
  const cleaned = String(expr)
    .replace(/,/g, ".")
    .replace(/x/gi, "*")
    .replace(/÷/g, "/")
    .replace(/[^0-9+\-*/().%\s]/g, "");
  if (!cleaned.trim()) return null;
  // eslint-disable-next-line no-new-func
  const val = Function(`"use strict"; return (${cleaned})`)();
  if (typeof val !== "number" || !Number.isFinite(val)) return null;
  return Number(val.toFixed(6));
}

function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("sin geo"));
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000
    });
  });
}

/**
 * Acciones nativas potentes del teléfono (sin PC).
 */
async function matchPhoneCommand(raw) {
  const t = norm(raw)
    .replace(/^(hey|oye|ok|hola)\s+jarvis[,:]?\s*/i, "")
    .trim();

  if (!t) return { handled: true, say: "Te escucho. ¿Qué necesitas?" };

  if (/^(hola|hey|buenas|que onda|quiubo)$/.test(t)) {
    return { handled: true, say: `¿Qué onda, ${localStorage.getItem(KEYS.name) || "bro"}? Aquí ando.` };
  }
  if (/quien eres|que eres|presentate/.test(t)) {
    return {
      handled: true,
      say: "Soy tu Jarvis del teléfono: voz, clima, crypto, pendientes, recordatorios, mapas y más. La PC es otro Jarvis."
    };
  }

  if (/que hora|hora es/.test(t)) {
    const clock = new Date().toLocaleTimeString("es-GT", { hour: "2-digit", minute: "2-digit" });
    return { handled: true, say: `Son las ${clock}.` };
  }
  if (/que dia|que fecha|fecha de hoy/.test(t)) {
    const date = new Date().toLocaleDateString("es-GT", { dateStyle: "full" });
    return { handled: true, say: `Hoy es ${date}.` };
  }

  if (/briefing|reporte|como esta todo|cómo esta todo|resumen del dia|resumen del día/.test(t)) {
    const clock = new Date().toLocaleTimeString("es-GT", { hour: "2-digit", minute: "2-digit" });
    const todos = getTodos().filter((x) => !x.done).slice(0, 3);
    const notes = getNotes().slice(-2);
    let weather = "";
    try {
      weather = await fetchWeather("Guatemala");
    } catch {
      weather = "Clima no disponible ahora.";
    }
    const todoPart = todos.length
      ? `Pendientes: ${todos.map((x) => x.text).join("; ")}.`
      : "Sin pendientes.";
    const notePart = notes.length ? `Notas: ${notes.map((n) => n.text).join("; ")}.` : "";
    return { handled: true, say: `Briefing · ${clock}. ${weather} ${todoPart} ${notePart}`.trim() };
  }

  if (/motivame|motivacion|animo/.test(t)) {
    const lines = [
      "Bro, hoy también se puede. Un paso a la vez.",
      "No tienes que ser perfecto, solo constante.",
      "Menos overthinking, más acción. Tú puedes.",
      "Si te cansas, descansa. No te rindas."
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

  // Memoria
  const remember = t.match(/(?:recuerda|acordate|guarda en memoria)\s+(.+)$/);
  if (remember) {
    const mem = getMemory();
    mem.push({ at: new Date().toISOString(), text: remember[1].trim() });
    saveJson(KEYS.memory, mem.slice(-30));
    return { handled: true, say: "Quedó en mi memoria del teléfono." };
  }
  if (/que recuerdas|qué recuerdas|mi memoria|recuerdos/.test(t)) {
    const mem = getMemory().slice(-5);
    return {
      handled: true,
      say: mem.length ? `Recuerdo: ${mem.map((m) => m.text).join("; ")}.` : "Aún no guardé nada."
    };
  }

  // Todos
  const addTodo = t.match(/(?:agrega|añade|anade|pon)\s+(?:a\s+)?(?:la\s+)?(?:lista|pendiente|todo|tarea)\s+(.+)$/) ||
    t.match(/(?:pendiente|tarea)\s*:\s*(.+)$/);
  if (addTodo) {
    const todos = getTodos();
    todos.push({ text: addTodo[1].trim(), done: false, at: new Date().toISOString() });
    saveJson(KEYS.todos, todos.slice(-40));
    return { handled: true, say: "Lo agregué a tus pendientes." };
  }
  if (/mis (pendientes|tareas|todos)|lista de (pendientes|tareas)/.test(t)) {
    const open = getTodos().filter((x) => !x.done).slice(0, 6);
    return {
      handled: true,
      say: open.length ? `Pendientes: ${open.map((x, i) => `${i + 1}. ${x.text}`).join(" ")}` : "Lista vacía. Estás al día."
    };
  }
  const doneTodo = t.match(/(?:termine|terminé|listo|completa(?:r)?)\s+(?:la\s+)?(?:tarea\s+)?(.+)$/);
  if (doneTodo && /tarea|pendiente|lista/.test(t)) {
    const todos = getTodos();
    const q = doneTodo[1].trim();
    const item = todos.find((x) => !x.done && norm(x.text).includes(q));
    if (item) {
      item.done = true;
      saveJson(KEYS.todos, todos);
      return { handled: true, say: `Marqué listo: ${item.text}.` };
    }
  }

  const note = t.match(/(?:anota|recuerda|nota)\s+(.+)$/);
  if (note && !/memoria|pendiente|tarea/.test(t)) {
    saveNote(note[1].trim());
    return { handled: true, say: "Listo, lo anoté en tu teléfono." };
  }
  if (/mis notas|que anote|qué anote|leer notas/.test(t)) {
    const notes = getNotes().slice(-3).map((n) => n.text);
    return {
      handled: true,
      say: notes.length ? `Tus últimas notas: ${notes.join("; ")}.` : "Aún no tienes notas."
    };
  }

  // Timer / reminder
  const timer = t.match(
    /(?:recuerdame|recuerdame|avisame|avisame|temporizador|timer|alarma)\s+(?:en\s+)?(\d+)\s*(segundos|segundo|minutos|minuto|mins|min|s)?(?:\s+(?:que|para|de|:)\s*(.+))?/
  );
  if (timer) {
    let secs = Number(timer[1]);
    const unit = timer[2] || "minutos";
    if (/^s(egundos?)?$/.test(unit)) secs = Number(timer[1]);
    else secs = Number(timer[1]) * 60;
    const label = (timer[3] || "tu aviso").trim();
    scheduleReminder(Math.max(1, secs), label);
    const human = secs >= 60 ? `${Math.round(secs / 60)} min` : `${secs} seg`;
    return { handled: true, say: `Va, te aviso en ${human}: ${label}.` };
  }

  // Calculator
  const math = t.match(/^(?:calcula|cuanto es|cuánto es|math)\s+(.+)$/);
  if (math) {
    try {
      const result = calcExpr(math[1]);
      if (result == null) throw new Error("bad");
      return { handled: true, say: `Da ${result}.` };
    } catch {
      return { handled: true, say: "No pude calcular eso. Prueba: calcula 25*4." };
    }
  }

  // Password
  if (/genera(r)? (una )?contraseña|password|clave segura/.test(t)) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$";
    let out = "";
    for (let i = 0; i < 16; i++) out += chars[Math.floor(Math.random() * chars.length)];
    try {
      await navigator.clipboard?.writeText(out);
      return { handled: true, say: `Contraseña lista y copiada: ${out}` };
    } catch {
      return { handled: true, say: `Tu contraseña: ${out}` };
    }
  }

  // Coin / dice
  if (/lanza (una )?moneda|cara o cruz/.test(t)) {
    return { handled: true, say: Math.random() < 0.5 ? "Cara." : "Cruz." };
  }
  if (/tira (un )?dado|lanza (un )?dado/.test(t)) {
    return { handled: true, say: `Salió ${1 + Math.floor(Math.random() * 6)}.` };
  }

  // Weather real
  const weather = t.match(/(?:clima|tiempo)(?:\s+(?:en|de)\s+(.+))?$/);
  if (weather && !/busca/.test(t)) {
    try {
      const say = await fetchWeather((weather[1] || "Guatemala").trim());
      return { handled: true, say };
    } catch {
      openUrl(`https://www.google.com/search?q=${encodeURIComponent(`clima ${weather[1] || "Guatemala"}`)}`);
      return { handled: true, say: "No pude leer el clima; abrí la búsqueda." };
    }
  }

  // Crypto
  const crypto = t.match(/(?:precio|cuanto vale|cuánto vale)\s+(de\s+)?(btc|bitcoin|eth|ethereum|sol|solana|doge)/);
  if (crypto || (/\b(bitcoin|btc|ethereum|eth)\b/.test(t) && /precio|vale|cuesta/.test(t))) {
    try {
      const say = await fetchCrypto(crypto?.[2] || "bitcoin");
      return { handled: true, say };
    } catch {
      return { handled: true, say: "No pude leer el precio ahora." };
    }
  }

  // FX
  const fx = t.match(
    /(?:cuanto(?:s)? (?:es|son)|cuánto(?:s)? (?:es|son)|convierte)\s+(\d+(?:[.,]\d+)?)\s*(dolares|dolares|usd|quetzales|gtq|euros|eur)(?:\s*(?:a|en)\s*(dolares|usd|quetzales|gtq|euros|eur))?/
  );
  if (fx) {
    const map = { dolares: "USD", usd: "USD", quetzales: "GTQ", gtq: "GTQ", euros: "EUR", eur: "EUR" };
    const from = map[fx[2]] || "USD";
    const to = map[fx[3]] || (from === "USD" ? "GTQ" : "USD");
    try {
      const say = await fetchExchange(Number(String(fx[1]).replace(",", ".")), from, to);
      return { handled: true, say };
    } catch {
      return { handled: true, say: "No pude convertir ahora." };
    }
  }

  // Wiki / qué es
  const wiki = t.match(/(?:wikipedia|wiki|que es|qué es|quien es|quién es)\s+(.+)$/);
  if (wiki && wiki[1].length < 70 && !/hora|jarvis/.test(t)) {
    try {
      const extract = await fetchWiki(wiki[1].trim());
      if (extract) return { handled: true, say: extract };
    } catch {
      /* fallthrough */
    }
  }

  // Translate
  const tr = t.match(/(?:traduce(?:r)?(?:\s+al\s+(ingles|ingles|español|espanol))?\s+)(.+)$/);
  if (tr) {
    const to = /espanol|español/.test(tr[1] || "") ? "es" : "en";
    try {
      const out = await fetchTranslate(tr[2].trim(), to);
      if (out) return { handled: true, say: out };
    } catch {
      openUrl(`https://translate.google.com/?sl=auto&tl=${to}&text=${encodeURIComponent(tr[2])}`);
      return { handled: true, say: "Abrí el traductor." };
    }
  }

  // Share
  if (/comparte(?:r)? (?:esto|el ultimo|el último)|share/.test(t)) {
    const last = [...messagesEl.querySelectorAll(".msg.bot")].at(-1)?.textContent || "Jarvis";
    if (navigator.share) {
      await navigator.share({ title: "Jarvis", text: last });
      return { handled: true, say: "Listo, compartí." };
    }
    try {
      await navigator.clipboard.writeText(last);
      return { handled: true, say: "Lo copié al portapapeles." };
    } catch {
      return { handled: true, say: "No pude compartir en este navegador." };
    }
  }

  // Location
  if (/donde estoy|dónde estoy|mi ubicacion|mi ubicación/.test(t)) {
    try {
      const pos = await getPosition();
      const { latitude, longitude } = pos.coords;
      openUrl(`https://www.google.com/maps?q=${latitude},${longitude}`);
      return { handled: true, say: "Te marqué en el mapa." };
    } catch {
      return { handled: true, say: "Necesito permiso de ubicación." };
    }
  }

  // Calendar event
  const cal = t.match(/(?:agenda|crea(?:r)? (?:un )?evento|calendario)\s+(.+)$/);
  if (cal) {
    const text = cal[1].trim();
    const start = new Date();
    start.setHours(start.getHours() + 1, 0, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const fmt = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    openUrl(
      `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(text)}&dates=${fmt(start)}/${fmt(end)}`
    );
    return { handled: true, say: "Te abrí Google Calendar con el evento." };
  }

  // Email compose
  const mail = t.match(/(?:correo|email|gmail)\s+(?:a\s+)?(\S+@\S+)\s+(?:asunto\s+)?(.+)$/) ||
    t.match(/envia(?:r)? correo\s+a\s+(\S+)\s+(.+)$/);
  if (mail) {
    openUrl(`mailto:${mail[1]}?subject=${encodeURIComponent(mail[2].slice(0, 80))}&body=${encodeURIComponent(mail[2])}`);
    return { handled: true, say: "Abrí el correo." };
  }

  // Open apps / sites
  const sites = [
    [/abre whatsapp|abrir whatsapp/, "https://wa.me/", "WhatsApp"],
    [/abre (youtube|you tube)/, "https://www.youtube.com", "YouTube"],
    [/abre (maps|mapas|google maps)/, "https://maps.google.com", "mapas"],
    [/abre (gmail|correo)/, "https://mail.google.com", "Gmail"],
    [/abre (instagram|insta)/, "https://www.instagram.com", "Instagram"],
    [/abre (tiktok|tik tok)/, "https://www.tiktok.com", "TikTok"],
    [/abre (spotify)/, "https://open.spotify.com", "Spotify"],
    [/abre (netflix)/, "https://www.netflix.com", "Netflix"],
    [/abre (drive)/, "https://drive.google.com", "Drive"],
    [/abre (calendar|calendario)/, "https://calendar.google.com", "Calendar"],
    [/abre (chatgpt|gpt)/, "https://chatgpt.com", "ChatGPT"],
    [/abre (github)/, "https://github.com", "GitHub"],
    [/abre (reddit)/, "https://www.reddit.com", "Reddit"],
    [/abre (twitter|x\b)/, "https://x.com", "X"],
    [/abre (facebook)/, "https://www.facebook.com", "Facebook"],
    [/abre (linkedin)/, "https://www.linkedin.com", "LinkedIn"],
    [/abre (amazon)/, "https://www.amazon.com", "Amazon"],
    [/abre (mercado ?libre)/, "https://www.mercadolibre.com.gt", "Mercado Libre"],
    [/abre (noticias)/, "https://news.google.com/?hl=es-419", "noticias"],
    [/abre (traductor)/, "https://translate.google.com/?hl=es", "traductor"]
  ];
  for (const [re, url, label] of sites) {
    if (re.test(t)) {
      openUrl(url);
      return { handled: true, say: `Abriendo ${label}.` };
    }
  }

  // Call by contact name or number
  const call = t.match(/(?:llama|llamar|marca)\s+(?:a\s+)?(.+)$/);
  if (call) {
    const who = call[1].trim();
    const digits = who.replace(/\D/g, "");
    const phone = digits.length >= 8 ? digits : resolveContact(who);
    if (phone) {
      openUrl(`tel:${phone}`);
      return { handled: true, say: `Llamando a ${who}.` };
    }
    return { handled: true, say: "Guarda el contacto en ⚙ (mamá: 502...) o dime el número." };
  }

  const sms = t.match(/(?:mensaje|sms|escribele|enviale)\s+(?:a\s+)?(.+?)\s+(?:que|dile|:)\s*(.+)$/);
  if (sms) {
    const who = sms[1].trim();
    const digits = who.replace(/\D/g, "");
    const phone = digits.length >= 8 ? digits : resolveContact(who);
    if (phone) {
      openUrl(`sms:${phone}?body=${encodeURIComponent(sms[2])}`);
      return { handled: true, say: "Te abrí el mensaje para enviarlo." };
    }
  }

  const wa =
    t.match(/(?:whatsapp|wasap)\s+(?:a\s+)?(.+?)\s*:\s*(.+)$/) ||
    t.match(/(?:mandale|enviale|escribele)\s+(?:a\s+)?(.+?)\s+por\s+whatsapp\s+(?:que\s+)?(.+)$/);
  if (wa) {
    const who = wa[1].trim();
    const maybePhone = who.replace(/\D/g, "");
    const phone = maybePhone.length >= 8 ? maybePhone : resolveContact(who);
    if (phone) {
      openUrl(`https://wa.me/${phone}?text=${encodeURIComponent(wa[2])}`);
      return { handled: true, say: `Abrí WhatsApp para ${who}.` };
    }
    openUrl(`https://wa.me/?text=${encodeURIComponent(`${who}: ${wa[2]}`)}`);
    return { handled: true, say: "Abrí WhatsApp. Elige el contacto y envía." };
  }

  const maps = t.match(/(?:como llegar|cómo llegar|mapa|ubicacion|ubicación|llevame|llévame)\s+(?:a\s+)?(.+)$/);
  if (maps) {
    openUrl(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(maps[1])}`);
    return { handled: true, say: `Ruta hacia ${maps[1]}.` };
  }

  const nearby = t.match(/(?:cerca|nearby|alrededor)\s+(.+)$/);
  if (nearby) {
    try {
      const pos = await getPosition();
      openUrl(
        `https://www.google.com/maps/search/${encodeURIComponent(nearby[1])}/@${pos.coords.latitude},${pos.coords.longitude},14z`
      );
      return { handled: true, say: `Busco ${nearby[1]} cerca de ti.` };
    } catch {
      openUrl(`https://www.google.com/maps/search/${encodeURIComponent(nearby[1])}`);
      return { handled: true, say: `Busco ${nearby[1]} en el mapa.` };
    }
  }

  const search =
    t.match(/^(?:busca|buscar|google|googlea)\s+(.+)$/) ||
    t.match(/^(?:imagenes|imágenes|fotos)\s+(?:de\s+)?(.+)$/) ||
    t.match(/^(?:noticias)\s+(?:de\s+)?(.+)$/);
  if (search) {
    let q = search[1];
    let url = `https://www.google.com/search?q=${encodeURIComponent(q)}`;
    if (/imagen|foto/.test(t)) url = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(q)}`;
    if (/noticia/.test(t)) url = `https://news.google.com/search?q=${encodeURIComponent(q)}&hl=es-419`;
    openUrl(url);
    return { handled: true, say: `Busco ${q}.` };
  }

  const yt = t.match(/(?:youtube|en youtube)\s+(?:busca\s+)?(.+)$/) || t.match(/busca(?:r)?\s+(.+)\s+en youtube$/);
  if (yt) {
    openUrl(`https://www.youtube.com/results?search_query=${encodeURIComponent(yt[1])}`);
    return { handled: true, say: "Lo busco en YouTube." };
  }

  const spotify = t.match(/(?:spotify|musica|música)\s+(?:busca\s+|pon\s+)?(.+)$/);
  if (spotify && !/abre spotify/.test(t)) {
    openUrl(`https://open.spotify.com/search/${encodeURIComponent(spotify[1])}`);
    return { handled: true, say: "Lo busco en Spotify." };
  }

  // QR
  const qr = t.match(/(?:genera(?:r)?|crea(?:r)?)\s+(?:un\s+)?qr\s+(?:de\s+|con\s+)?(.+)$/);
  if (qr) {
    openUrl(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr[1])}`);
    return { handled: true, say: "Te abrí el QR." };
  }

  if (/ayuda|que puedes|qué puedes|comandos/.test(t)) {
    return {
      handled: true,
      say: "Puedo: clima real, crypto, cambio de moneda, pendientes, recordatorios, contactos, WhatsApp, llamadas, mapas, wiki, traducir, calcular, briefing, Spotify, Calendar y más. Di ayuda cuando quieras."
    };
  }

  return null;
}

async function askGroq(text) {
  const key = localStorage.getItem(KEYS.api) || "";
  const name = localStorage.getItem(KEYS.name) || "Cristopher";
  if (!key) throw new Error("Falta tu Groq API Key. Toca ⚙ y pégala (gratis en console.groq.com).");

  const todos = getTodos().filter((x) => !x.done).slice(0, 5).map((x) => x.text);
  const mem = getMemory().slice(-5).map((m) => m.text);

  const system = `Eres Jarvis, asistente personal del TELÉFONO de ${name}.
NO controlas una laptop. Ayudas en el celular: consejos, ideas, organización, humor, explicaciones, planes.
Español cercano y suelto (guatemalteco informal ok). 1 a 3 oraciones para voz.
Si piden controlar la PC, di que este Jarvis es del teléfono; el de la laptop es aparte.
Pendientes actuales: ${todos.length ? todos.join("; ") : "ninguno"}.
Memoria: ${mem.length ? mem.join("; ") : "vacía"}.
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
    const local = await matchPhoneCommand(value);
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
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
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
  `Qué onda${localStorage.getItem(KEYS.name) ? `, ${localStorage.getItem(KEYS.name)}` : ""}. Jarvis pro en el cel: clima, crypto, pendientes, recordatorios, contactos, mapas, wiki… Di "ayuda" o "briefing".`
);

if (!localStorage.getItem(KEYS.api)) settings.showModal();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
