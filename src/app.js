// src/app.js
require("dotenv").config();
const express = require("express");
const path = require("path");
const cors = require("cors");
const logger = require("./logger");

const youtubeRoutesFactory = require("./youtube/youtubeRoutes");
const youtubeAuth = require("./auth/youtubeAuth");
const uploadSentiment = require("../routes/uploadSentiment");
const sentimentRoutes = require("../routes/uploadSentiment");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// app.js - GANTI FUNGSI safePayload
function safePayload(payload, maxSize = 800) {
  const copy = {
    type: payload.type,
    runId: payload.runId,
    item: payload.item ? { videoId: payload.item.videoId } : null
  };

  // Simplify message
  if (typeof payload.message === 'string') {
    copy.message = payload.message.substring(0, 300);
  } else if (payload.message?.decision) {
    // ✅ CHECK DECISION FIRST (before preview, since payload can have both)
    copy.message = {
      decision: {
        use_context: payload.message.decision.use_context,
        sentiment_enabled: payload.message.decision.sentiment_enabled,
        use_comment_ai: payload.message.decision.use_comment_ai,
        sentimentSource: payload.message.decision.sentimentSource,
        sentimentMode: payload.message.decision.sentimentMode,
        source: payload.message.decision.source
      },
      sentimentResult: payload.message.sentimentResult,
      moderationStatus: payload.message.moderationStatus,
      preview: (payload.message.preview || "").substring(0, 100)
    };
  } else if (payload.message?.preview) {
    copy.message = {
      preview: payload.message.preview.substring(0, 150) + "...",
      status: payload.message.status
    };
  }

  return JSON.stringify(copy);
}

// SSE clients - use Map
const sseClients = new Map();

app.get("/log/stream", (req, res) => {
  const clientId = Date.now() + Math.random();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  sseClients.set(clientId, res);

  req.on("close", () => {
    sseClients.delete(clientId);
    res.end();
  });

  res.on("error", () => {
    sseClients.delete(clientId);
  });
});

function pushLog(payload) {
  const data = safePayload(payload);
  const deadClients = [];

  sseClients.forEach((res, clientId) => {
    try {
      res.write(`data: ${data}\n\n`);
    } catch (e) {
      deadClients.push(clientId);
    }
  });

  // Cleanup dead clients
  deadClients.forEach(id => sseClients.delete(id));
}

// mount auth routes
app.use("/", youtubeAuth);

// mount youtube routes and pass pushLog
app.use("/", youtubeRoutesFactory(pushLog));
app.use("/upload", uploadSentiment);
app.use("/sentiment", sentimentRoutes);

// serve frontend
app.use(express.static(path.join(__dirname, "../public")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  console.log(`Server running on port ${PORT}`);
});
