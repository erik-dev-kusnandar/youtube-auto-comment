// src/dataStore.js
const fs = require("fs");
const path = require("path");

const dataFile = path.join(__dirname, "../data/store.json");

// ensure file exists
if (!fs.existsSync(dataFile)) {
  fs.writeFileSync(
    dataFile,
    JSON.stringify({ videos: [], comments: [] }, null, 2)
  );
}

function load() {
  return JSON.parse(fs.readFileSync(dataFile));
}

function save(data) {
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
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
};
