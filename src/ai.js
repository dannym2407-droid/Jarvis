const { config } = require("./config");

const SYSTEM_PROMPT = `Eres ${config.assistantName}, el asistente personal de escritorio de ${config.userName}.
Hablas español claro, cercano y directo (tono guatemalteco informal está bien).
Controlas una laptop Windows. Responde corto (máximo 2-3 oraciones) porque tu respuesta se lee en voz alta.
Si el usuario pide una acción del sistema, responde SOLO con JSON en una línea:
{"action":"NOMBRE","args":{...},"say":"frase corta para decir en voz alta"}
Acciones disponibles:
- open_app: args { "name": "chrome|edge|notepad|explorer|spotify|discord|vscode|calculator|cmd|powershell|settings" }
- open_url: args { "url": "https://..." }
- open_path: args { "path": "C:\\\\..." }
- search_web: args { "query": "texto" }
- volume: args { "level": 0-100 } o { "mute": true|false } o { "delta": -10|10 }
- lock: args {}
- sleep: args {}
- screenshot: args {}
- tell_time: args {}
- tell_date: args {}
- none: cuando solo conversas (usa say para la respuesta hablada)
Si no hace falta acción, usa action "none".
No inventes acciones. No uses markdown.`;

async function askGroq(userText, history = []) {
  if (!config.groqApiKey) {
    return {
      action: "none",
      args: {},
      say: "No tengo clave de Groq configurada. Copia .env.example a .env y pega tu API key gratis de console.groq.com."
    };
  }

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.slice(-8),
    { role: "user", content: userText }
  ];

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.groqApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.groqModel,
      temperature: 0.4,
      max_tokens: 350,
      messages
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq ${response.status}: ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content?.trim() || "";
  return parseAiReply(raw);
}

function parseAiReply(raw) {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        action: parsed.action || "none",
        args: parsed.args || {},
        say: parsed.say || raw.replace(jsonMatch[0], "").trim() || "Listo."
      };
    } catch {
      // fallthrough
    }
  }
  return { action: "none", args: {}, say: raw || "No te escuché bien." };
}

module.exports = { askGroq, parseAiReply };
