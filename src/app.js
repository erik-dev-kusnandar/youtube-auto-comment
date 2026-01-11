// src/app.js
require("dotenv").config();
const express = require("express");
const path = require("path");
const cors = require("cors");
const logger = require("./logger");

const youtubeRoutesFactory = require("./youtube/youtubeRoutes");
const uploadSentiment = require("../routes/uploadSentiment");
const sentimentRoutes = require("../routes/uploadSentiment");

const app = express();

// Auth Dependencies
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const sequelize = require('./db/database');
const User = require('./models/User');
const authRoutes = require('./auth/authRoutes');
const { isAuthenticated } = require('./auth/authMiddleware');

// Init Database & Admin
sequelize.sync().then(async () => {
  logger.info("Database synced");
  const admin = await User.findOne({ where: { username: 'admin' } });
  if (!admin) {
    await User.create({ username: 'admin', email: 'admin@local.host', password: 'admin123', role: 'admin' });
    logger.info("Default Admin created: admin / admin123");
  }
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session Setup
app.use(session({
  store: new SQLiteStore({ dir: 'data', db: 'sessions.sqlite' }),
  secret: 'super_secret_key_youtube_auto_comment', // In prod use env
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 } // 1 week
}));

// 1. Auth Routes (Public)
app.use('/', authRoutes);

// 2. Static Assets (Public) - CSS, JS, Images
app.use('/css', express.static(path.join(__dirname, '../public/css')));
app.use('/js', express.static(path.join(__dirname, '../public/js')));
app.use('/img', express.static(path.join(__dirname, '../public/img')));

// 3. Protect ALL other routes
app.use(isAuthenticated);


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
