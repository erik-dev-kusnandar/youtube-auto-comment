const { rewriteComment } = require("../src/ai/aiCommentService");

/**
 * Classify sentiment into:
 * positive | neutral | negative | sensitive | ambiguous
 * - Ringan: 1 prompt singkat
 * - Aman: fallback rule-based
 */

const store = require("../src/dataStore");

function pickRandomSentiment() {
  const pool = store.getSentimentPool();

  if (!pool || pool.length === 0) {
    return "neutral"; // fallback aman
  }

  const idx = Math.floor(Math.random() * pool.length);
  return pool[idx];
}


async function classifySentiment({ title = "", description = "" }) {
  const text = `${title}\n${description}`.trim();
  if (!text) return "neutral";

  // ===== Rule-based cepat (fallback / pre-check)
  const lower = text.toLowerCase();
  const sensitiveKeywords = [
    "politik", "agama", "konflik", "perang", "pemilu",
    "kecelakaan", "meninggal", "bencana", "korupsi", "hukum"
  ];
  if (sensitiveKeywords.some(k => lower.includes(k))) {
    return "sensitive";
  }

  try {
    // ===== LLM mini classification (pakai engine AI yang sudah ada)
    const prompt = `
Klasifikasikan sentimen teks berikut.
PILIH SATU SAJA:
positive | neutral | negative | sensitive | ambiguous

TEKS:
${text}

Jawab SATU kata saja.
`.trim();

    const res = await rewriteComment({
      title: "Sentiment Classifier",
      description: "",
      draft: prompt
    });

    const s = (res || "").toLowerCase().trim();
    if (["positive","neutral","negative","sensitive","ambiguous"].includes(s)) {
      return s;
    }
  } catch (_) {
    // ignore, fallback below
  }

  // ===== Default aman
  return "neutral";
}

module.exports = { classifySentiment, pickRandomSentiment };
