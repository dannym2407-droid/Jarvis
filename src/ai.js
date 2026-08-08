const { config } = require("./config");

const SYSTEM_PROMPT = `Eres Jarvis, asistente de voz de ${config.userName} en Windows.
Responde SOLO JSON válido, sin markdown:
{"action":"NOMBRE","args":{},"say":"frase corta"}
o {"steps":[{"action":"...","args":{}}],"say":"..."}

SI ES UNA ORDEN (abre/cierra/busca/git/volumen/clima/...): SIEMPRE pon action real. NUNCA action none.
none SOLO para charla pura (chiste, opinión).

Acciones frecuentes:
open_app:{name} launch_any:{name} open_site:{name} search_web:{query,type}
kill_process:{name} volume:{delta|level|mute} media:{control}
whatsapp_message:{contact,message,send:true}
tell_time tell_date weather:{city} battery git_status git_commit git_push
diagnose explain_terminal project_health search_youtube lock screenshot
mode:{name} briefing radar workspace delegate_code:{project,prompt,editor}
none

Reglas: "abre X"=>open_app con name canónico (whatsapp, vscode, cursor, chrome, terminal...).
NUNCA uses find_file ni start_search para abrir apps. "visual"/"vs code"/"code"=>vscode. "wasap"=>whatsapp.
say máximo 12 palabras. Ahora: ${new Date().toLocaleString("es-GT")}`;

async function askGroq(userText, history = []) {
  if (!config.groqApiKey) {
    return {
      action: "none",
      args: {},
      say: "Bro, me falta la clave de Groq en el env."
    };
  }

  const model = config.groqModelFast || config.groqModel || "llama-3.1-8b-instant";

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.slice(-6),
    { role: "user", content: userText }
  ];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.groqApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 220,
        response_format: { type: "json_object" },
        messages
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Groq ${response.status}: ${errText.slice(0, 200)}`);
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content?.trim() || "";
    return parseAiReply(raw);
  } finally {
    clearTimeout(timer);
  }
}

function parseAiReply(raw) {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed.steps) && parsed.steps.length) {
        return {
          action: "multi",
          args: { steps: parsed.steps.slice(0, 6) },
          say: String(parsed.say || "Voy con eso.").trim()
        };
      }
      return {
        action: parsed.action || "none",
        args: parsed.args || {},
        say: String(parsed.say || "").trim() || "Va, listo."
      };
    } catch {
      // fallthrough
    }
  }

  const cleaned = raw
    .replace(/```[\s\S]*?```/g, "")
    .replace(/[*_`#]/g, "")
    .trim();
  return {
    action: "none",
    args: {},
    say: cleaned.slice(0, 280) || "No te agarré bien, repíteme bro."
  };
}

module.exports = { askGroq, parseAiReply };
