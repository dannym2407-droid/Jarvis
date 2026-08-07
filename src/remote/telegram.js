const { handleInstruction } = require("../core/brain");
const { config } = require("../config");

/**
 * Control remoto gratis por Telegram.
 * 1) Habla con @BotFather → /newbot → copia el token
 * 2) Pon TELEGRAM_BOT_TOKEN=... en .env
 * 3) Escríbele a tu bot desde el celular
 */
function startTelegramBot() {
  const token = config.telegramBotToken;
  if (!token) {
    console.log("[telegram] sin TELEGRAM_BOT_TOKEN (opcional para controlar desde el celular)");
    return;
  }

  let offset = 0;
  console.log("[telegram] bot remoto activo. Escríbele a tu bot desde el teléfono.");

  async function poll() {
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${token}/getUpdates?timeout=25&offset=${offset}`
      );
      const data = await res.json();
      if (!data.ok) {
        console.warn("[telegram]", data.description || "error");
        setTimeout(poll, 4000);
        return;
      }

      for (const update of data.result || []) {
        offset = update.update_id + 1;
        const msg = update.message;
        if (!msg?.text || !msg.chat?.id) continue;
        const chatId = msg.chat.id;
        const text = String(msg.text || "").trim();
        if (!text || text.startsWith("/start")) {
          await sendTelegram(
            token,
            chatId,
            "Jarvis online. Mándame órdenes: abre Cursor, briefing, modo enfoque, clima..."
          );
          continue;
        }

        await sendTelegram(token, chatId, "Va, estoy en eso...");
        try {
          const result = await handleInstruction(text, {
            speakReply: true,
            browserAudio: false
          });
          const reply = [result.ack, result.say].filter(Boolean).join(" ");
          await sendTelegram(token, chatId, reply || "Listo.");
        } catch (error) {
          await sendTelegram(token, chatId, `Falló: ${error.message}`);
        }
      }
    } catch (error) {
      console.warn("[telegram]", error.message);
    }
    setTimeout(poll, 600);
  }

  poll();
}

async function sendTelegram(token, chatId, text) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: String(text || "").slice(0, 3500)
    })
  });
}

module.exports = { startTelegramBot };
