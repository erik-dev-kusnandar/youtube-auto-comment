// FILEUPLOAD.JS — FIXED

const express = require("express");
const multer = require("multer");
const path = require("path");
const store = require("./dataStore");
const router = express.Router();
const { extractVideoId } = require("./utils");

const upload = multer({
    dest: path.join(__dirname, "../uploads"),
});

// CSV parser
const fs = require("fs");
const Papa = require("papaparse");

async function parseCSV(filePath) {
  const fileContent = fs.readFileSync(filePath, "utf8");

  return new Promise((resolve, reject) => {
    Papa.parse(fileContent, {
      header: true,
      skipEmptyLines: true,
      delimiter: ",",
      quoteChar: '"',
      escapeChar: '"',
      newline: "\n",
      dynamicTyping: false,
      transformHeader: h => h.trim(),
      transform: v => (typeof v === "string" ? v.trim() : v),
      complete: res => resolve(res.data),
      error: err => reject(err),
    });
  });
}


// Upload Video CSV
router.post("/videos", upload.single("file"), async (req, res) => {
    if (!req.file) return res.json({ message: "No video CSV uploaded." });

    const rows = parseCSV(req.file.path);

    const videos = rows
        .filter(r => r.video_url)
        .map(r => {
            let url = r.video_url.trim();
            let id = url.includes("v=")
                ? url.split("v=")[1]
                : url.replace("https://youtu.be/", "");

            return { url, videoId: id, status: "pending", comment: "" };
        });

    const formatted = rows.map(r => {
        const url = r.video_url || r.videoId || r.url;
        return {
            videoUrl: url || "",          // <-- ADD THIS
            videoId: extractVideoId(url),
            status: "pending",
            comment: ""
        };
        });

    store.saveVideos(formatted);

    // store.saveVideos(videos);

    res.json({ message: `Uploaded ${videos.length} videos 🎥` });
});


// Upload Comment CSV
router.post("/comments", upload.single("file"), async (req, res) => {
    if (!req.file) return res.json({ message: "No comment CSV uploaded." });

    const rows = parseCSV(req.file.path);

    const comments = rows
        .filter(r => r.comment_text)
        .map(r => ({ text: r.comment_text.trim() }));

    store.saveComments(comments);

    res.json({ message: `Uploaded ${comments.length} comments 💬` });
});

module.exports = router;
