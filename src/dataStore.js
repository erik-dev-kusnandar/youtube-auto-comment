// src/dataStore.js
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "../data");
const STORE_FILE = path.join(DATA_DIR, "store.json");
const TOKENS_FILE = path.join(DATA_DIR, "tokens.json");

function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  if (!fs.existsSync(STORE_FILE)) {
    fs.writeFileSync(
      STORE_FILE,
      JSON.stringify({ videos: [], comments: [], postingLogs: [] }, null, 2)
    );
  }

  if (!fs.existsSync(TOKENS_FILE)) {
    fs.writeFileSync(TOKENS_FILE, JSON.stringify({}, null, 2));
  }
}

function load() {
  ensure();
  return JSON.parse(fs.readFileSync(STORE_FILE, "utf-8"));
}

function save(data) {
  fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2));
}

module.exports = {
  // ===== BASIC =====
  getAll() {
    return load();
  },

  saveVideos(videos) {
    const s = load();
    s.videos = videos;
    save(s);
  },

  saveComments(comments) {
    const s = load();
    s.comments = comments;
    save(s);
  },

  updateVideoStatus(videoId, status, comment = "") {
    const s = load();
    const v = s.videos.find(x => x.videoId === videoId);
    if (v) {
      v.status = status;
      v.comment = comment;
    }
    save(s);
  },

  // ===== LOGGING =====
  addPostingLog(log) {
    const s = load();
    s.postingLogs = s.postingLogs || [];
    s.postingLogs.push(log);
    save(s);
  },

  // ===== TOKEN =====
  TOKEN_PATH: TOKENS_FILE,
};
