// ========================================
//  CSV Upload Handler (Videos & Comments)
// ========================================
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const Papa = require("papaparse");
const store = require("./dataStore");

const router = express.Router();

// Multer: save raw CSV files
const upload = multer({
  dest: path.join(__dirname, "../uploads")
});

// ======================================================
// PARSE CSV (robust, support multiline & quoted fields)
// ======================================================
function parseCSV(filePath) {
  return new Promise((resolve, reject) => {
    const file = fs.readFileSync(filePath, "utf8");

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      complete: (results) => resolve(results.data),
      error: (err) => reject(err)
    });
  });
}

// ======================================================
// UPLOAD VIDEO LIST
// ======================================================
router.post("/videos", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.json({ message: "No file uploaded." });

    const rows = await parseCSV(req.file.path);

    if (!Array.isArray(rows)) {
      return res.json({ message: "CSV format error (rows not array)" });
    }

    const videos = rows
      .map(r => ({
        videoUrl: r.video_url || r.videoId || "",
        videoId: extractVideoId(r.video_url || r.videoId || ""),
        status: "pending",
        comment: ""
      }))
      .filter(v => v.videoId);

    store.saveVideos(videos);

    res.json({ message: `Uploaded ${videos.length} videos 🎥` });

  } catch (err) {
    console.error("UPLOAD VIDEO ERROR:", err);
    res.json({ message: "Error parsing CSV (video list)" });
  }
});

// ======================================================
// UPLOAD COMMENT LIST (supports multi-line + quotes)
// ======================================================
router.post("/comments", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.json({ message: "No file uploaded." });

    const rows = await parseCSV(req.file.path);

    const comments = rows
      .map(r => ({
        text: (r.comment_text || "").trim()
      }))
      .filter(c => c.text.length > 0);

    store.saveComments(comments);

    res.json({ message: `Uploaded ${comments.length} comments 💬` });

  } catch (err) {
    console.error("UPLOAD COMMENT ERROR:", err);
    res.json({ message: "Error parsing CSV (comments)" });
  }
});

// ======================================================
// YOUTUBE ID EXTRACTOR (support shorts, url, embed, etc.)
// ======================================================
function extractVideoId(url) {
  if (!url) return "";

  try {
    if (url.includes("youtube.com/watch?v=")) {
      return url.split("v=")[1].split("&")[0];
    }

    if (url.includes("youtube.com/shorts/")) {
      return url.split("shorts/")[1].split("?")[0];
    }

    if (url.includes("youtu.be/")) {
      return url.split("shorts/")[1].split("?")[0];
    }

    if (url.length === 11) return url;

  } catch (e) {}

  return "";
}

module.exports = router;
