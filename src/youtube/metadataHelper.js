// src/youtube/metadataHelper.js

function cleanDescription(text = "") {
  return text
    .split("\n")
    .map(l => l.trim())
    .filter(l =>
      l.length > 20 &&
      !l.startsWith("http") &&
      !l.startsWith("#") &&
      !l.toLowerCase().includes("subscribe") &&
      !l.toLowerCase().includes("follow")
    )
    .slice(0, 2) // cukup 1–2 kalimat
    .join(" ");
}

function buildCommentFromMetadata(meta, template) {
  const title = meta.title || "";
  const desc = cleanDescription(meta.description || "");

  return template
    .replace(/{title}/gi, title)
    .replace(/{desc}/gi, desc);
}

module.exports = {
  cleanDescription,
  buildCommentFromMetadata
};
