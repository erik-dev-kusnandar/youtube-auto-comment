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

module.exports = { extractVideoId };
// End of src/utils.js