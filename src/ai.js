const { config } = require("./config");

const SYSTEM_PROMPT = `Eres ${config.assistantName}, asistente de voz de ${config.userName} en Windows.
Habla suelto, natural, confiado, tono guatemalteco informal (bro, va, de una). Sin sonar robot.
Si conversan: responde en texto libre (1-3 oraciones), cálido y útil.
Si hay que HACER algo en la PC: responde SOLO un JSON:
{"action":"NOMBRE","args":{...},"say":"frase natural corta"}

Acciones:
- whatsapp_message:{contact,message,send:true}
- close_apps:{}  ← SOLO si dice "todas" / "todo lo abierto"
- kill_process:{name}
- mode:{name:morning|focus|coding|chill|gaming|meeting}
- briefing:{}
- window:{action:left|right|maximize|minimize}
- clipboard_ai:{mode:summary|translate|improve|explain}
- remember:{text} | recall:{}
- smart_answer:{question}
- list_processes:{}
- search_web:{query,type:web|images|videos|news|shopping|maps|scholar|duck}
- search_youtube|search_maps|search_wikipedia
- open_app|open_site|open_folder|open_url|open_path
- volume|media|lock|sleep|screenshot|snip|show_desktop|task_manager
- weather|battery|system_status|wifi_info
- note|clipboard|copy_clipboard|type_text
- empty_recycle|joke|motivation|whoami|crypto|timer
- coin_flip|dice|password|create_folder|notepad_text
- settings_page|shutdown|email|news|define|run_cmd
- tell_time|tell_date|none
- disk_space|clear_temp|restart_explorer|speedtest|ip_info
- brightness:{level} | night_light:{on} | focus_assist:{mode}
- find_file:{query} | open_found:{query} | large_downloads:{}
- exchange:{amount,from,to} | stock:{symbol} | translate:{text,to}
- wiki_summary:{query} | routine:{name:estudio|trabajo|gaming|noche}
- sticky_notes|bluetooth|wifi_settings|qr:{text}|password_copy|countdown:{date,label}

Reglas:
- close_apps SOLO con "todas" o "todo lo abierto"
- "cierra chrome/spotify/..." => kill_process
- "modo mañana/enfoque/coding/chill/gaming/reunión" => mode
- "briefing" => briefing
- Preguntas generales => none con say útil o smart_answer
- WhatsApp con contact + message
- Sin markdown. Ahora: ${new Date().toLocaleString("es-GT")}`;

async function askGroq(userText, history = []) {
  if (!config.groqApiKey) {
    return {
      action: "none",
      args: {},
      say: "Bro, me falta la clave de Groq en el env."
    };
  }

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.slice(-14),
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
      temperature: 0.9,
      max_tokens: 500,
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
    say: cleaned.slice(0, 450) || "No te agarré bien, repíteme bro."
  };
}

module.exports = { askGroq, parseAiReply };
