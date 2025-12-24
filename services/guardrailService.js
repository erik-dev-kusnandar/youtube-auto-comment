// services/guardrailService.js

const SAFE_COMMENTS = {
  sensitive: [
    "Topik ini memang cukup kompleks, semoga dibahas dengan bijak.",
    "Isu seperti ini memang perlu disikapi dengan hati-hati.",
    "Menarik untuk diikuti, semoga membawa dampak positif."
  ],
  negative: [
    "Semoga ke depannya bisa lebih baik.",
    "Ini bisa jadi bahan evaluasi ke depan.",
  ]
};

function applyGuardrail({ sentiment, text }) {
  if (!sentiment) return { text, blocked: false };

  if (sentiment === "sensitive" || sentiment === "negative") {
    const pool = SAFE_COMMENTS[sentiment];
    const safe = pool[Math.floor(Math.random() * pool.length)];
    return {
      text: safe,
      blocked: true
    };
  }

  return { text, blocked: false };
}

module.exports = { applyGuardrail };
