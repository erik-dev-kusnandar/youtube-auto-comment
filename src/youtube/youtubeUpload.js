// src/youtube/youtubeUpload.js
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const Papa = require("papaparse");
const logger = require("../logger");
const store = require("../dataStore");

const upload = multer({ dest: path.join(__dirname, "../../uploads") });
const router = express.Router();

function parseCSV(pathToFile) {
  const raw = fs.readFileSync(pathToFile, "utf8");
  const parsed = Papa.parse(raw, { header: true, skipEmptyLines: true });
  return parsed.data;
}

router.post("/videos", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file" });
    const rows = parseCSV(req.file.path);
    const videos = rows
      .map((r) => {
        const url = r.video_url || r.videoUrl || r.videoId || r.video_id;
        if (!url) return null;
        let vid = url;
        try {
          const u = new URL(url);
          if (u.searchParams && u.searchParams.get("v")) vid = u.searchParams.get("v");
          else { const p = u.pathname.split("/").filter(Boolean); vid = p[p.length - 1]; }
        } catch { vid = url.trim(); }
        return { url: url.trim(), videoId: vid.trim(), status: "pending", comment: "" };
      })
      .filter(Boolean);
    store.saveVideos(videos);
    logger.info(`Uploaded ${videos.length} videos`);
    return res.json({ message: `Uploaded ${videos.length} videos` });
  } catch (err) {
    logger.error("Upload failed: " + err.message);
    return res.status(500).json({ message: "Upload failed" });
  }
});

router.post("/comments", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file" });
    const rows = parseCSV(req.file.path);
    const comments = rows
      .map((r) => {
        const txt = r.comment_text || r.comment || r.text;
        return txt ? { text: txt } : null;
      })
      .filter(Boolean);
    store.saveComments(comments);
    logger.info(`Uploaded ${comments.length} comments`);
    return res.json({ message: `Uploaded ${comments.length} comments` });
  } catch (err) {
    logger.error("Upload failed: " + err.message);
    return res.status(500).json({ message: "Upload failed" });
  }
});

module.exports = router;
