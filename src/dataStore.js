// src/dataStore.js
const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "../data/store.json");
const TOKENS_FILE = path.join(__dirname, "../data/tokens.json");

function ensure() {
  if (!fs.existsSync(path.join(__dirname, "../data"))) {
    fs.mkdirSync(path.join(__dirname, "../data"));
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify({ videos: [], comments: [], hourly: { count: 0, resetAt: 0 } }, null, 2)
    );
  }
}

function load() {
  ensure();
  return JSON.parse(fs.readFileSync(DATA_FILE));
}

function save(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

module.exports = {
  getAll() {
    return load();
  },
  saveVideos(list) {
    const data = load();
    data.videos = list;
    save(data);
  },
  saveComments(list) {
    const data = load();
    data.comments = list;
    save(data);
  },
  updateVideoStatus(videoId, status, comment = "") {
    const data = load();
    const v = data.videos.find((x) => x.videoId === videoId);
    if (v) {
      v.status = status;
      v.comment = comment;
    }
    save(data);
  },
  readStoreFile() {
    return load();
  },
  saveStoreFile(data) {
    save(data);
  },
  TOKEN_PATH: TOKENS_FILE,
};
