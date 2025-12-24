const express = require("express");
const multer = require("multer");
const fs = require("fs");
const store = require("../src/dataStore");

const upload = multer({ dest: "uploads/" });
const router = express.Router();

router.post("/sentiment", upload.single("file"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, error: "No file uploaded" });
    }

    const raw = fs.readFileSync(req.file.path, "utf8");

    const list = raw
      .split(/\r?\n/)
      .map(x => x.trim())
      .filter(Boolean);

    store.setSentimentPool(list);

    console.log("Sentiment pool loaded:", list);

    res.json({
      ok: true,
      count: list.length,
      pool: list
    });
  } catch (e) {
    console.error("Upload sentiment error:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get("/sentiment/pool", (req, res) => {
  const pool = store.getSentimentPool?.() || [];
  res.json({ ok: true, pool });
});

module.exports = router;
