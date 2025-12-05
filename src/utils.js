// src/utils.js

function extractVideoId(input) {
  if (!input) return null;
  input = input.trim();

  try {
    // Case: already videoId (length = 11 typical)
    if (input.length === 11 && /^[A-Za-z0-9_-]+$/.test(input)) {
      return input;
    }

    // Case: watch URL
    if (input.includes("watch?v=")) {
      return input.split("watch?v=")[1].split("&")[0];
    }

    // Case: shorts URL
    if (input.includes("/shorts/")) {
      return input.split("/shorts/")[1].split("?")[0];
    }

    // Case: youtu.be short URL
    if (input.includes("youtu.be/")) {
      return input.split("youtu.be/")[1].split("?")[0];
    }

    return null;
  } catch {
    return null;
  }
}

// Smart Random Comment Picker (tanpa duplikat tiap video)
function pickSmartComments(comments, count) {
  const pool = comments.map(c => c.text);   // <- ini penting karena comments berisi object
  if (!pool.length) return [];

  // Shuffle random
  const shuffled = [...pool].sort(() => Math.random() - 0.5);

  // Jika jumlah komentar cukup
  if (shuffled.length >= count) {
    return shuffled.slice(0, count);
  }

  // Jika kurang → isi ulang secara random
  const result = [...shuffled];
  while (result.length < count) {
    result.push(pool[Math.floor(Math.random() * pool.length)]);
  }

  return result;
}

function randomDelay(minMs, maxMs) {
  return Math.floor(Math.random() * (maxMs - minMs + 1) + minMs);
}


module.exports = {
  extractVideoId,
  pickSmartComments,
  randomDelay
};
// End of src/utils.js