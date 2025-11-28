const express = require("express");
const multer = require("multer");
const csv = require("csv-parser");
const fs = require("fs");
const path = require("path");
const store = require("./dataStore");

const router = express.Router();
const upload = multer({ dest: "uploads/" });

function parseCSV(filePath) {
  return new Promise((resolve) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (row) => results.push(row))
      .on("end", () => resolve(results));
  });
}

function extractVideoId(urlOrId) {
  if (!urlOrId) return null;

  // Case: 11-char ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(urlOrId)) return urlOrId;

  // youtu.be/VIDEOID
  if (urlOrId.includes("youtu.be")) {
    return urlOrId.split("/").pop().substring(0, 11);
  }

  // youtube.com/watch?v=VIDEOID
  if (urlOrId.includes("v=")) {
    return urlOrId.split("v=")[1].substring(0, 11);
  }

  return null;
}

router.post("/videos", upload.single("file"), async (req, res) => {
  const rows = await parseCSV(req.file.path);

  const videos = rows.map((r) => {
    const url = r.video_url || r.url || "";
    const id = extractVideoId(url);
    return {
      url,
      videoId: id,
      status: id ? "pending" : "invalid",
      comment: ""
    };
  });

  store.saveVideos(videos);

  res.json({
    ok: true,
    message: `Uploaded ${videos.length} videos 🚀`
  });
});

router.post("/comments", upload.single("file"), async (req, res) => {
  const rows = await parseCSV(req.file.path);

  const comments = rows.map((r) => ({
    text: r.comment_text || ""
  }));

  store.saveComments(comments);

  res.json({
    ok: true,
    message: `Uploaded ${comments.length} comments 💬`
  });
});

module.exports = router;
