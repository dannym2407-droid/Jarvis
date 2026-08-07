const os = require("node:os");
const { config } = require("../config");

function getLanIPs() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const list of Object.values(nets)) {
    for (const net of list || []) {
      if (net.family === "IPv4" && !net.internal) ips.push(net.address);
    }
  }
  return ips;
}

function phoneUrls() {
  const port = config.port;
  return getLanIPs().map((ip) => `http://${ip}:${port}/phone.html`);
}

module.exports = { getLanIPs, phoneUrls };
