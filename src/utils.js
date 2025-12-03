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
  const shuffled = [...comments].sort(() => Math.random() - 0.5);

  // Jika komentar kurang dari count → looping ulang tapi tetap random
  if (shuffled.length >= count) {
    return shuffled.slice(0, count);
  }

  let result = [...shuffled];
  while (result.length < count) {
    result.push(shuffled[Math.floor(Math.random() * shuffled.length)]);
  }

  return result;
}

module.exports = { pickSmartComments };
module.exports = { extractVideoId };
// End of src/utils.js