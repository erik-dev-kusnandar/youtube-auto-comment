// src/fileUpload.js
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const Papa = require("papaparse");

const upload = multer({ dest: path.join(__dirname, "../uploads") });

function parseCSV(pathToFile) {
  const raw = fs.readFileSync(pathToFile, "utf8");
  const parsed = Papa.parse(raw, { header: true, skipEmptyLines: true });
  return parsed.data;
}

module.exports = ({ pushLog, store }) => {
  const router = express.Router();

  router.post("/videos", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file" });

      const rows = parseCSV(req.file.path);
      // accept header video_url or videoId
      const videos = rows
        .map((r, idx) => {
          const url = r.video_url || r.videoUrl || r.videoId || r.video_id;
          if (!url) return null;
          // extract videoId if full url
          let vid = url;
          try {
            const u = new URL(url);
            if (u.searchParams && u.searchParams.get("v")) {
              vid = u.searchParams.get("v");
            } else {
              // short URLs: /shorts/<id> or youtu.be/<id>
              const p = u.pathname.split("/").filter(Boolean);
              vid = p[p.length - 1];
            }
          } catch (e) {
            // not a url, assume raw id
            vid = url.trim();
          }
          return { url: url.trim(), videoId: vid.trim(), status: "pending", comment: "" };
        })
        .filter(Boolean);

      store.saveVideos(videos);
      pushLog({ type: "info", message: `Uploaded ${videos.length} videos` });
      return res.json({ message: `Uploaded ${videos.length} videos` });
    } catch (err) {
      pushLog({ type: "error", message: "Upload failed: " + err.message });
      return res.status(500).json({ message: "Upload failed" });
    }
  });

  router.post("/comments", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file" });
      const rows = parseCSV(req.file.path);

      // support quoted multiline values (Papaparse header:true handles it)
      const comments = rows
        .map((r) => {
          const txt = r.comment_text || r.comment || r.text;
          return txt ? { text: txt } : null;
        })
        .filter(Boolean);

      store.saveComments(comments);
      pushLog({ type: "info", message: `Uploaded ${comments.length} comments` });
      return res.json({ message: `Uploaded ${comments.length} comments` });
    } catch (err) {
      pushLog({ type: "error", message: "Upload failed: " + err.message });
      return res.status(500).json({ message: "Upload failed" });
    }
  });

  return router;
};
