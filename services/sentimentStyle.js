// services/sentimentStyle.js

const STYLE_PREFIX = {
  positive: [
    "Keren banget!",
    "Mantap sih ini.",
    "Seru banget nontonnya."
  ],

  "very positive": [
    "Gila, ini keren parah!",
    "Sumpah ini top banget!",
    "Asli, ini konten favorit."
  ],

  neutral: [
    "Menarik juga pembahasannya.",
    "Penjelasannya cukup jelas.",
    "Topik ini cukup informatif."
  ],

  negative: [
    "Agak disayangkan sih.",
    "Semoga ke depannya bisa lebih baik.",
    "Ini jadi bahan evaluasi juga ya."
  ],

  sensitive: [
    "Topik ini memang cukup sensitif.",
    "Perlu dibahas dengan hati-hati.",
    "Isu seperti ini memang tidak sederhana."
  ],

  ambiguous: [
    "Menarik, tapi masih agak membingungkan.",
    "Perlu penjelasan lebih lanjut sepertinya.",
    "Masih terbuka untuk banyak sudut pandang."
  ]
};

function applySentimentStyle({ sentiment, text }) {
  if (!sentiment || sentiment === "none") return text;

  const pool = STYLE_PREFIX[sentiment];
  if (!pool) return text;

  const prefix = pool[Math.floor(Math.random() * pool.length)];

  // anti double prefix
  if (text.toLowerCase().startsWith(prefix.toLowerCase())) {
    return text;
  }

  return `${prefix} ${text}`;
}

module.exports = {
  applySentimentStyle
};
