const express = require("express");
const multer = require("multer");
const csv = require("csv-parser");
const fs = require("fs");
const store = require("../src/dataStore");

const upload = multer({ dest: "uploads/" });
const router = express.Router();

router.post("/sensitive", upload.single("file"), (req, res) => {
  const results = [];

  fs.createReadStream(req.file.path)
    .pipe(csv())
    .on("data", (row) => {
      results.push(row.keyword.toLowerCase());
    })
    .on("end", () => {
      const username = req.session.username;
      if (username) {
        store.setSensitiveKeywords(username, results);
      } else {
        console.error("No username in session for sensitive upload");
      }

      fs.unlinkSync(req.file.path);

      res.json({
        ok: true,
        total: results.length
      });
    });
});

module.exports = router;
