// src/dataStore.js
const fs = require("fs");
const path = require("path");

const STORE_FILE = path.join(__dirname, "../data/store.json");
const FB_STORE_FILE = path.join(__dirname, "../data/facebookStore.json");
const TOKENS_FILE = path.join(__dirname, "../data/tokens.json");

function ensure() {
  const dir = path.join(__dirname, "../data");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(STORE_FILE)) {
    fs.writeFileSync(STORE_FILE, JSON.stringify({ videos: [], comments: [], hourly: { count: 0, resetAt: 0 } }, null, 2));
  }
  if (!fs.existsSync(FB_STORE_FILE)) {
    fs.writeFileSync(FB_STORE_FILE, JSON.stringify({ posts: [] }, null, 2));
  }
  if (!fs.existsSync(TOKENS_FILE)) {
    fs.writeFileSync(TOKENS_FILE, JSON.stringify({}, null, 2));
  }
}

function loadStore() { ensure(); return JSON.parse(fs.readFileSync(STORE_FILE)); }
function saveStore(data) { fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2)); }

module.exports = {
  // generic store
  getAll() { return loadStore(); },
  getVideos() { return loadStore().videos || []; },
  getComments() { return loadStore().comments || []; },
  saveVideos(list) {
    const s = loadStore(); s.videos = list; saveStore(s);
  },
  saveComments(list) {
    const s = loadStore(); s.comments = list; saveStore(s);
  },
  updateVideoStatus(videoId, status, comment = "") {
    const s = loadStore();
    const v = (s.videos || []).find(x => x.videoId === videoId);
    if (v) { v.status = status; v.comment = comment; }
    saveStore(s);
  },
  // facebook store minimal
  readFacebookStore() { ensure(); return JSON.parse(fs.readFileSync(FB_STORE_FILE)); },
  saveFacebookPost(post) {
    const s = JSON.parse(fs.readFileSync(FB_STORE_FILE));
    s.posts.push(post);
    fs.writeFileSync(FB_STORE_FILE, JSON.stringify(s, null, 2));
  },
  // tokens
  TOKEN_PATH: TOKENS_FILE
};
