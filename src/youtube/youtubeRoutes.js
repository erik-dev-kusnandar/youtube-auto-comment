// src/youtube/youtubeRoutes.js
const express = require("express");
const uploadRouter = require("./youtubeUpload");
const store = require("../dataStore");
const { startYoutubeWorker } = require("./youtubeWorker");
const { fetchVideoMetadata } = require("./youtubeService");
const { buildCommentFromMetadata } = require("./metadataHelper");
const { rewriteComment } = require("../ai/aiCommentService");

module.exports = (pushLog) => {
  const router = express.Router();

  // mount upload router at /upload
  router.use("/upload", uploadRouter);

  // progress endpoint
  router.get("/progress", (req, res) => {
    res.json(store.getAll());
  });

  // start worker with optional query params
  router.get("/start", (req, res) => {

    const opts = {
      postingDuration: Number(req.query.postingDuration),
      minDelay: Number(req.query.minDelay),
      maxDelay: Number(req.query.maxDelay),
    };

    // run worker async (do not block)
    startYoutubeWorker(opts, pushLog).catch(e => {
      console.error("Worker error:", e.message);
    });

    res.json({ ok: true, message: "Worker started with duration mode" });

  });

  router.get("/status", (req, res) => {
    res.json(store.getWorkerState());
  });

  router.post("/stop", (req, res) => {
    store.stopWorker();
    store.requestStop();

    res.json({ ok: true });
  });

  router.get("/test-comment", async (req, res) => {
    try {
      const { videoId } = req.query;
      const meta = await fetchVideoMetadata(videoId);
      const comments = store.getAll().comments;

      const template = comments[Math.floor(Math.random() * comments.length)].text;
      const finalComment = buildCommentFromMetadata(meta, template);

      res.json({
        videoId,
        title: meta.title,
        template,
        finalComment
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get("/test-comment-ai", async (req, res) => {
    try {
      const { videoId } = req.query;

      const meta = await fetchVideoMetadata(videoId);
      const comments = store.getAll().comments;

      const template = comments[Math.floor(Math.random() * comments.length)].text;
      const draft = buildCommentFromMetadata(meta, template);

      let finalComment = draft;

      if (process.env.ENABLE_AI_COMMENT === "true") {
        finalComment = await rewriteComment({
          title: meta.title,
          description: meta.description.substring(0, 300),
          draft,
        });
      }

      res.json({
        videoId,
        draft,
        finalComment,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });


  return router;
};
