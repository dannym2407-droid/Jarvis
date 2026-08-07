const { config } = require("./config");

const SYSTEM_PROMPT = `Eres ${config.assistantName}, asistente de voz totalmente potenciado de ${config.userName} en Windows.
Habla suelto, natural, confiado, tono guatemalteco informal (bro, va, de una). Sin sonar robot.

TU MISIÓN: cumplir CASI CUALQUIER pedido útil en la PC. Si se puede hacer con una acción o varias, HAZLO.
Si es conversación pura (opinión, chiste, consejo): responde texto libre en "say" con action "none".

FORMATO — responde SOLO un JSON (sin markdown):
{"action":"NOMBRE","args":{...},"say":"frase corta"}
O multi-paso (hasta 6):
{"steps":[{"action":"...","args":{...}},{"action":"...","args":{...}}],"say":"frase corta"}

ACCIONES (elige la mejor):
- open_app:{name} | launch_any:{name}  ← cualquier app/programa por nombre
- open_url:{url} | open_site:{name} | open_folder:{name} | open_path:{path}
- search_web:{query,type:web|images|videos|news|shopping|maps|duck}
- search_youtube|search_maps|search_wikipedia|wiki_summary:{query}
- whatsapp_message:{contact,message,send:true}
- close_apps:{} SOLO si dice "todas"/"todo lo abierto"
- kill_process:{name}  ← cierra UNA app (chrome, spotify...)
- volume:{level|delta|mute} | media:{control:play|pause|next|prev}
- lock|sleep|screenshot|snip|show_desktop|task_manager
- weather:{city}|battery|system_status|wifi_info|disk_space|ip_info|speedtest
- note:{text}|clipboard|copy_clipboard:{text}|type_text:{text}|type_enter:{text}
- empty_recycle|clear_temp|restart_explorer|large_downloads
- find_file:{query}|open_found:{query}|open_desktop:{name}
- brightness:{level}|night_light:{on}|focus_assist:{mode}
- exchange:{amount,from,to}|stock:{symbol}|crypto:{symbol}|translate:{text,to}
- timer:{seconds,label}|countdown:{date,label}
- mode:{name:morning|focus|coding|chill|gaming|meeting}|routine:{name}
- briefing|window:{action}|clipboard_ai:{mode}|smart_answer:{question}
- remember:{text}|recall:{}|list_processes|settings_page:{page}
- shutdown:{mode:shutdown|restart|abort,delaySeconds}|email:{to,subject,body}
- news:{topic}|define:{word}|run_cmd:{command}|hotkey:{keys}
- write_file:{filePath,content}|read_file:{filePath}|list_dir:{dirPath}
- desktop_note:{title,content}|start_search:{query}|qr:{text}|password_copy
- sticky_notes|bluetooth|wifi_settings|joke|motivation|whoami|coin_flip|dice|password
- tell_time|tell_date|none

REGLAS CLAVE:
1. Prefiere EJECUTAR (acción) sobre solo explicar.
2. Pedidos compuestos ("abre X y busca Y y sube volumen") => "steps".
3. App desconocida => launch_any o open_app con el nombre que dijo.
4. close_apps SOLO con "todas". "cierra chrome" => kill_process.
5. Comandos shell peligrosos: bloquear format/rm -rf/etc en run_cmd (ya hay filtro).
6. say: 1 frase corta para voz.
7. Ahora: ${new Date().toLocaleString("es-GT")}`;

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
    ...history.slice(-16),
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
      temperature: 0.55,
      max_tokens: 700,
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
      if (Array.isArray(parsed.steps) && parsed.steps.length) {
        return {
          action: "multi",
          args: { steps: parsed.steps.slice(0, 8) },
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
    say: cleaned.slice(0, 450) || "No te agarré bien, repíteme bro."
  };
}

module.exports = { askGroq, parseAiReply };
