// src/app.js
require("dotenv").config();
const express = require("express");
const path = require("path");
const cors = require("cors");
const store = require("./dataStore");
const uploader = require("./fileUpload");
const { postComment } = require("./youtubeService");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

let sseClients = [];

// SSE endpoint
app.get("/log/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  sseClients.push(res);

  req.on("close", () => {
    sseClients = sseClients.filter((c) => c !== res);
  });
});

function pushLog(data) {
  sseClients.forEach((c) => c.write(`data: ${JSON.stringify(data)}\n\n`));
}

// Uploads
app.use("/upload", uploader);

// Progress
app.get("/progress", (req, res) => {
  res.json(store.getAll());
});

// Main worker
app.get("/start", async (req, res) => {
  res.json({ ok: true });
  const data = store.getAll();

  let commentIndex = 0;

  for (const v of data.videos) {
    try {
      store.updateVideoStatus(v.videoId, "processing");
      pushLog({ type: "processing", item: v });

      const selectedComment = data.comments[commentIndex];
      commentIndex = (commentIndex + 1) % data.comments.length;

      await postComment(v.videoId, selectedComment.text);


      store.updateVideoStatus(v.videoId, "done", selectedComment.text);
      pushLog({ type: "done", item: store.getAll().videos.find(x => x.videoId === v.videoId) });



    } catch (err) {
      store.updateVideoStatus(v.videoId, "error");
      pushLog({ type: "error", item: v, message: err.message });
    }
  }

  pushLog({ type: "finished" });
});

// Start server
app.listen(process.env.PORT, () => {
  console.log("Dashboard running on port", process.env.PORT);
});
