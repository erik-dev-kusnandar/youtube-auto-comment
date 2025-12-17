// src/dataStore.js
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "../data");
const STORE_FILE = path.join(DATA_DIR, "store.json");
const TOKENS_FILE = path.join(DATA_DIR, "tokens.json");

// =======================
// INIT FILES
// =======================
function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  if (!fs.existsSync(STORE_FILE)) {
    fs.writeFileSync(
      STORE_FILE,
      JSON.stringify(
        { videos: [], comments: [], postingLogs: [] },
        null,
        2
      )
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

// =======================
// WORKER STATE (PERSISTENT)
// =======================
let workerState = {
  running: false,
  stopRequested: false,
  startTime: null,
  endTime: null,
  durationMs: 0,
};

function startWorker(durationMs) {
  workerState.running = true;
  workerState.stopRequested = false;
  workerState.startTime = Date.now();
  workerState.endTime = workerState.startTime + durationMs;
  workerState.durationMs = durationMs;
}

function stopWorker() {
  workerState.running = false;
}

function finishWorker() {
  workerState.running = false;
  workerState.stopRequested = false;
  workerState.startTime = null;
  workerState.endTime = null;
  workerState.durationMs = 0;
}

function isWorkerRunning() {
  return workerState.running === true;
}

function requestStop() {
  workerState.stopRequested = true;
}

function shouldStop() {
  return workerState.stopRequested;
}

function getWorkerState() {
  if (!workerState.running) {
    return { running: false };
  }

  const now = Date.now();
  const elapsed = now - workerState.startTime;
  const remainingMs = Math.max(0, workerState.durationMs - elapsed);

  return {
    running: remainingMs > 0,
    startTime: workerState.startTime,
    durationMs: workerState.durationMs,
    remainingMs,
  };
}

function incrementVideoProgress(videoId, comment) {
  const video = state.videos.find(v => v.videoId === videoId);
  if (!video) return;

  video.totalPosted = (video.totalPosted || 0) + 1;
  video.status = "done";
  video.comment = comment;
  video.lastPostedAt = Date.now();

  save();
}

module.exports.incrementVideoProgress = incrementVideoProgress;

// =======================
// EXPORT API (SATU KALI)
// =======================
module.exports = {
  // ===== DATA =====
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

  // ===== LOG =====
  addPostingLog(log) {
    const s = load();
    s.postingLogs = s.postingLogs || [];
    s.postingLogs.push(log);
    save(s);
  },

  // ===== WORKER STATE =====
  startWorker,
  stopWorker,
  getWorkerState,
  requestStop,
  shouldStop,
  isWorkerRunning,
  finishWorker,

  // ===== TOKEN =====
  TOKEN_PATH: TOKENS_FILE,
};
