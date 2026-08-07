/**
 * Ofertas pendientes genéricas (proactivo, git, etc.)
 * Di "sí" / "confirma" / "dale" para ejecutar.
 */
const pending = {
  type: null,
  text: null,
  steps: null, // [{ action, args }]
  askedAt: 0,
  ttlMs: 3 * 60 * 1000
};

function setOffer({ type, text, steps, ttlMs } = {}) {
  pending.type = type || "offer";
  pending.text = text || "";
  pending.steps = Array.isArray(steps) ? steps.slice(0, 6) : [];
  pending.askedAt = Date.now();
  pending.ttlMs = ttlMs || 3 * 60 * 1000;
}

function clearOffer() {
  pending.type = null;
  pending.text = null;
  pending.steps = null;
  pending.askedAt = 0;
}

function getOffer() {
  if (!pending.type) return null;
  if (Date.now() - pending.askedAt > pending.ttlMs) {
    clearOffer();
    return null;
  }
  return {
    type: pending.type,
    text: pending.text,
    steps: pending.steps,
    askedAt: pending.askedAt
  };
}

function isAffirmative(text) {
  const t = String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim();
  return /^(si|sí|ok|dale|va|hazlo|adelante|confirmo|confirma|claro|de una|yes)\b/.test(t) ||
    /\b(si por favor|sí por favor|dale pues|va pues|hazlo)\b/.test(t);
}

function isNegative(text) {
  const t = String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim();
  return /^(no|nel|cancel|cancela|cancelar|olvidalo|olvidalo|nop)\b/.test(t);
}

module.exports = {
  setOffer,
  clearOffer,
  getOffer,
  isAffirmative,
  isNegative
};
