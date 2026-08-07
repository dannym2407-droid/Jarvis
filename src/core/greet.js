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
  const options = [
    `${greeting}, ${name}. Jarvis listo.`,
    `${greeting}. ¿Qué hacemos?`,
    `Qué onda, ${name}. Aquí ando.`
  ];
  return options[Math.floor(Math.random() * options.length)];
}

module.exports = { buildGreeting, timeOfDay };
