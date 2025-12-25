// src/dataStore.js
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "../data");
const TOKENS_FILE = path.join(DATA_DIR, "tokens.json");

// =======================
// INIT FILES
// =======================
function getStoreFilePath(username) {
  if (!username) throw new Error("Username required for data store");
  // Sanitize username to be safe for filename
  const safeUsername = username.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  // Create folder: data/<username>/
  return path.join(DATA_DIR, safeUsername, `store_${safeUsername}.json`);
}

function ensure(username) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const safeUsername = username.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const userDir = path.join(DATA_DIR, safeUsername);

  // Ensure user directory exists
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }

  const storeFile = getStoreFilePath(username);

  if (!fs.existsSync(storeFile)) {
    fs.writeFileSync(
      storeFile,
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

function load(username) {
  ensure(username);
  return JSON.parse(fs.readFileSync(getStoreFilePath(username), "utf-8"));
}

function save(username, data) {
  fs.writeFileSync(getStoreFilePath(username), JSON.stringify(data, null, 2));
}

// =======================
// WORKER STATE (PERSISTENT PER USER)
// =======================
const workerStates = new Map();

function getWorkerStateObj(username) {
  if (!workerStates.has(username)) {
    workerStates.set(username, {
      running: false,
      stopRequested: false,
      startTime: null,
      endTime: null,
      durationMs: 0,
    });
  }
  return workerStates.get(username);
}

function startWorker(username, durationMs) {
  const state = getWorkerStateObj(username);
  state.running = true;
  state.stopRequested = false;
  state.startTime = Date.now();
  state.endTime = state.startTime + durationMs;
  state.durationMs = durationMs;
}

function stopWorker(username) {
  const state = getWorkerStateObj(username);
  state.running = false;
}

function finishWorker(username) {
  const state = getWorkerStateObj(username);
  state.running = false;
  state.stopRequested = false;
  state.startTime = null;
  state.endTime = null;
  state.durationMs = 0;
}

function isWorkerRunning(username) {
  const state = getWorkerStateObj(username);
  return state.running === true;
}

function requestStop(username) {
  const state = getWorkerStateObj(username);
  state.stopRequested = true;
}

function shouldStop(username) {
  const state = getWorkerStateObj(username);
  return state.stopRequested;
}

function getWorkerState(username) {
  const state = getWorkerStateObj(username);

  if (!state.running) {
    return { running: false };
  }

  const now = Date.now();
  const elapsed = now - state.startTime;
  const remainingMs = Math.max(0, state.durationMs - elapsed);

  return {
    running: remainingMs > 0,
    startTime: state.startTime,
    durationMs: state.durationMs,
    remainingMs,
  };
}

// function incrementVideoProgress(videoId, comment) {
//   const video = state.videos.find(v => v.videoId === videoId);
//   if (!video) return;

//   video.totalPosted = (video.totalPosted || 0) + 1;
//   video.status = "done";
//   video.comment = comment;
//   video.lastPostedAt = Date.now();

//   save();
// }

// Sentiment pool is currently global, can be made per user if needed.
// For simplicity, let's keep it global or just in memory per request scope?
// Actually sentiment pool is used by worker. Let's make it per user too.
const sentimentPools = new Map();

function setSentimentPool(username, list = []) {
  sentimentPools.set(username, list);
}

function getSentimentPool(username) {
  return sentimentPools.get(username) || [];
}

// =======================
// EXPORT API
// =======================
module.exports = {
  // ===== DATA =====
  getAll(username) {
    return load(username);
  },

  saveVideos(username, videos) {
    const s = load(username);
    s.videos = videos;
    save(username, s);
  },

  saveComments(username, comments) {
    const s = load(username);
    s.comments = comments;
    save(username, s);
  },

  // updateVideoStatus(videoId, status, comment = "") {
  //   const s = load();
  //   const v = s.videos.find(x => x.videoId === videoId);
  //   if (v) {
  //     v.status = status;
  //     v.comment = comment;
  //   }
  //   save(s);
  // },

  updateVideoStatus(username, videoId, status, comment = "", decision = null) {
    const s = load(username);
    const v = s.videos.find(x => x.videoId === videoId);
    if (v) {
      v.status = status;
      v.comment = comment;

      // ✅ SIMPAN DECISION JIKA ADA
      if (decision) {
        v.decision = decision;
      }
    }
    save(username, s);
  },
  // ===== LOG =====
  addPostingLog(username, log) {
    const s = load(username);
    s.postingLogs = s.postingLogs || [];
    s.postingLogs.push(log);
    save(username, s);
  },

  // ===== WORKER STATE =====
  startWorker,
  stopWorker,
  getWorkerState,
  requestStop,
  shouldStop,
  isWorkerRunning,
  finishWorker,
  setSentimentPool,
  getSentimentPool,

  // ===== SENSITIVE KEYWORDS (PER USER) =====
  setSensitiveKeywords(username, list = []) {
    // We can store this in memory or file. Ideally file if persisted. 
    // For now, let's keep in memory like sentimentPools.
    // Or reuse sentimentPools map logic? No, separate map.
    if (!global.sensitiveKeywordsMap) global.sensitiveKeywordsMap = new Map();
    global.sensitiveKeywordsMap.set(username, list);
  },

  getSensitiveKeywords(username) {
    if (!global.sensitiveKeywordsMap) return [];
    return global.sensitiveKeywordsMap.get(username) || [];
  },

  // ===== TOKEN =====
  TOKEN_PATH: TOKENS_FILE, // Shared
};
