const { buildGreeting } = require("../src/core/greet");
const { speak } = require("../src/voice/tts");

(async () => {
  const text = buildGreeting();
  console.log(text);
  await speak(text);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
