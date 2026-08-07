const { config } = require("../config");

function timeOfDay() {
  const hour = new Date().getHours();
  if (hour < 12) return "Buenos días";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

function buildGreeting() {
  const name = config.userName;
  const greeting = timeOfDay();
  const weekday = new Date().toLocaleDateString("es-GT", { weekday: "long" });
  const clock = new Date().toLocaleTimeString("es-GT", {
    hour: "2-digit",
    minute: "2-digit"
  });

  const lines = [
    `${greeting}, ${name}.`,
    `Soy ${config.assistantName}, listo para ayudarte.`,
    `Hoy es ${weekday}, son las ${clock}.`,
    "Dime qué necesitas."
  ];

  return lines.join(" ");
}

module.exports = { buildGreeting, timeOfDay };
