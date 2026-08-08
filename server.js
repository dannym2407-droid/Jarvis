const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { config } = require("./src/config");
const { buildGreeting } = require("./src/core/greet");
const { handleInstruction, clearHistory } = require("./src/core/brain");
const { speak, warmVoiceCache, synthesizeToFile } = require("./src/voice/tts");

const PUBLIC = path.join(__dirname, "public");
const AUDIO_DIR = path.join(os.homedir(), ".jarvis-tts-cache");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg"
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function serveStatic(req, res) {
  let reqPath = decodeURIComponent(new URL(req.url, "http://local").pathname);
  if (reqPath === "/") reqPath = "/index.html";
  const filePath = path.normalize(path.join(PUBLIC, reqPath));
  if (!filePath.startsWith(PUBLIC)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404).end("Not found");
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
}

function serveAudio(fileName, res) {
  const safe = path.basename(fileName);
  if (!/^[a-f0-9]+\.mp3$/i.test(safe)) {
    res.writeHead(400).end("Bad audio");
    return;
  }
  const filePath = path.join(AUDIO_DIR, safe);
  if (!fs.existsSync(filePath)) {
    res.writeHead(404).end("Missing audio");
    return;
  }
  res.writeHead(200, {
    "Content-Type": "audio/mpeg",
    "Cache-Control": "public, max-age=86400"
  });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${config.host}:${config.port}`);

  try {
    if (req.method === "GET" && url.pathname === "/api/health") {
      return sendJson(res, 200, {
        ok: true,
        name: config.assistantName,
        user: config.userName,
        groq: Boolean(config.groqApiKey)
      });
    }

    if (req.method === "GET" && url.pathname === "/api/greeting") {
      const text = buildGreeting();
      let audioUrl = null;
      try {
        const file = await synthesizeToFile(text);
        if (file) audioUrl = `/api/audio/${path.basename(file)}`;
      } catch (error) {
        console.warn("[greet-audio]", error.message);
      }
      if (process.env.JARVIS_ELECTRON === "1") {
        speak(text).catch(() => {});
      }
      return sendJson(res, 200, { text, audioUrl });
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/audio/")) {
      return serveAudio(url.pathname.replace("/api/audio/", ""), res);
    }

    if (req.method === "POST" && url.pathname === "/api/greet") {
      const text = buildGreeting();
      let audioUrl = null;
      try {
        const file = await synthesizeToFile(text);
        if (file) audioUrl = `/api/audio/${path.basename(file)}`;
      } catch {
        // ignore
      }
      // También intenta hablar en servidor por si no hay panel
      speak(text).catch(() => {});
      return sendJson(res, 200, { ok: true, text, audioUrl });
    }

    if (req.method === "POST" && url.pathname === "/api/command") {
      const body = await readBody(req);
      const browserAudio = body.browserAudio !== false;
      const speakSystem = Boolean(body.speakSystem) || process.env.JARVIS_ELECTRON === "1";
      const speakReply = speakSystem ? true : browserAudio ? false : body.speak !== false;
      console.log("[cmd]", body.text);
      const result = await handleInstruction(body.text || "", {
        speakReply: speakSystem || speakReply,
        browserAudio,
        speakSystem
      });
      console.log("[result]", result.action, result.say);
      return sendJson(res, 200, result);
    }

    if (req.method === "POST" && url.pathname === "/api/speak") {
      const body = await readBody(req);
      const text = body.text || "";
      if (body.browserAudio) {
        const file = await synthesizeToFile(text);
        return sendJson(res, 200, {
          ok: true,
          audioUrl: file ? `/api/audio/${path.basename(file)}` : null
        });
      }
      await speak(text);
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === "POST" && url.pathname === "/api/transcribe") {
      const body = await readBody(req);
      if (!config.groqApiKey) {
        return sendJson(res, 400, { error: "Falta GROQ_API_KEY en .env" });
      }
      const b64 = String(body.audioBase64 || "").replace(/^data:audio\/\w+;base64,/, "");
      if (!b64) return sendJson(res, 400, { error: "Sin audio" });
      const mime = String(body.mime || "audio/webm");
      const ext = /mp4|m4a|aac/i.test(mime) ? "m4a" : /ogg/i.test(mime) ? "ogg" : /wav/i.test(mime) ? "wav" : "webm";
      const tmp = path.join(os.tmpdir(), `jarvis-stt-${Date.now()}.${ext}`);
      fs.writeFileSync(tmp, Buffer.from(b64, "base64"));
      try {
        const buf = fs.readFileSync(tmp);
        const form = new FormData();
        const file = new File([buf], `audio.${ext}`, { type: mime });
        form.append("file", file);
        form.append("model", "whisper-large-v3-turbo");
        form.append("language", "es");
        form.append("response_format", "json");
        const tr = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${config.groqApiKey}` },
          body: form
        });
        const raw = await tr.text();
        if (!tr.ok) {
          return sendJson(res, 502, { error: `Whisper ${tr.status}: ${raw.slice(0, 180)}` });
        }
        const data = JSON.parse(raw);
        return sendJson(res, 200, { ok: true, text: String(data.text || "").trim() });
      } finally {
        try {
          fs.unlinkSync(tmp);
        } catch {
          // ignore
        }
      }
    }

    if (req.method === "GET" && url.pathname === "/api/radar") {
      const { radarPayload } = require("./src/sense/workspace");
      const data = await radarPayload();
      return sendJson(res, 200, data);
    }

    if (req.method === "GET" && url.pathname === "/api/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive"
      });
      res.write(`data: ${JSON.stringify({ type: "hello", at: new Date().toISOString() })}\n\n`);
      const { subscribe, getLastSuggestion } = require("./src/sense/proactive");
      const last = getLastSuggestion();
      if (last) res.write(`data: ${JSON.stringify(last)}\n\n`);
      const unsub = subscribe((event) => {
        try {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        } catch {
          // ignore
        }
      });
      const ping = setInterval(() => {
        try {
          res.write(`: ping\n\n`);
        } catch {
          // ignore
        }
      }, 25000);
      req.on("close", () => {
        clearInterval(ping);
        unsub();
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/clear") {
      clearHistory();
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === "GET" || req.method === "HEAD") {
      return serveStatic(req, res);
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    console.error(error);
    // Nunca devolver solo "Error" crudo al cliente de voz
    sendJson(res, 200, {
      ok: false,
      say: "Se me trabó esa orden, bro. Inténtalo otra vez.",
      action: "none",
      result: { ok: false, message: error.message || "Error interno" }
    });
  }
});

async function openPanel() {
  const url = `http://127.0.0.1:${config.port}/`;
  const { spawn } = require("node:child_process");
  spawn("cmd", ["/c", "start", "", url], {
    detached: true,
    stdio: "ignore",
    windowsHide: true
  }).unref();
}

function startServer(options = {}) {
  const shouldOpen =
    options.openBrowser === true ||
    (options.openBrowser !== false &&
      !process.argv.includes("--no-open") &&
      !process.env.JARVIS_ELECTRON &&
      !process.env.ELECTRON_RUN_AS_NODE);

  warmVoiceCache().catch(() => {});

  const { phoneUrls } = require("./src/remote/lan");
  const { startTelegramBot } = require("./src/remote/telegram");

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, config.host, async () => {
      console.log(`${config.assistantName} listo → http://127.0.0.1:${config.port}`);
      const phones = phoneUrls();
      if (phones.length) {
        console.log("Teléfono (misma WiFi):");
        for (const u of phones) console.log(`  ${u}`);
      }
      if (!config.groqApiKey) {
        console.log("Aviso: falta GROQ_API_KEY en .env");
      }
      startTelegramBot();
      try {
        const { startProactive } = require("./src/sense/proactive");
        startProactive(60000);
        console.log("Radar proactivo ON");
      } catch (error) {
        console.warn("[proactive]", error.message);
      }
      if (shouldOpen) {
        try {
          openPanel();
        } catch (error) {
          console.error("[open]", error.message);
        }
      }
      resolve({
        port: config.port,
        host: config.host,
        url: `http://127.0.0.1:${config.port}/`
      });
    });
  });
}

function stopServer() {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error("[boot]", error.message);
    process.exit(1);
  });
}

module.exports = { startServer, stopServer, server };