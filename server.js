const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { config } = require("./src/config");
const { buildGreeting } = require("./src/core/greet");
const { handleInstruction, clearHistory } = require("./src/core/brain");
const { speak } = require("./src/voice/tts");

const PUBLIC = path.join(__dirname, "public");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
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
      return sendJson(res, 200, { text });
    }

    if (req.method === "POST" && url.pathname === "/api/greet") {
      const text = buildGreeting();
      speak(text).catch((e) => console.error("[tts]", e.message));
      return sendJson(res, 200, { ok: true, text });
    }

    if (req.method === "POST" && url.pathname === "/api/command") {
      const body = await readBody(req);
      const speakReply = body.speak !== false;
      const result = await handleInstruction(body.text || "", { speakReply });
      return sendJson(res, 200, result);
    }

    if (req.method === "POST" && url.pathname === "/api/speak") {
      const body = await readBody(req);
      await speak(body.text || "");
      return sendJson(res, 200, { ok: true });
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
    sendJson(res, 500, { error: error.message || "Error interno" });
  }
});

async function boot() {
  const shouldGreet = process.argv.includes("--greet");

  server.listen(config.port, config.host, async () => {
    console.log(
      `${config.assistantName} listo → http://${config.host}:${config.port}`
    );
    if (!config.groqApiKey) {
      console.log("Aviso: falta GROQ_API_KEY en .env (gratis en console.groq.com)");
    }

    if (shouldGreet) {
      const text = buildGreeting();
      console.log("[saludo]", text);
      try {
        await speak(text);
      } catch (error) {
        console.error("[tts]", error.message);
      }
    }
  });
}

boot();
