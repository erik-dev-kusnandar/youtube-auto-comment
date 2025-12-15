// src/app.js
require("dotenv").config();
const express = require("express");
const path = require("path");
const cors = require("cors");
const logger = require("./logger");

const youtubeRoutesFactory = require("./youtube/youtubeRoutes");
const youtubeAuth = require("./auth/youtubeAuth");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// SSE LOG clients
let sseClients = [];
function pushLog(payload) {
  sseClients.forEach(res => res.write(`data: ${JSON.stringify(payload)}\n\n`));
}

// SSE stream
app.get("/log/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  sseClients.push(res);
  req.on("close", () => { sseClients = sseClients.filter(x => x !== res); });
});

// mount auth routes
app.use("/", youtubeAuth);

// mount youtube routes and pass pushLog
app.use("/", youtubeRoutesFactory(pushLog));

// serve frontend
app.use(express.static(path.join(__dirname, "../public")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  console.log(`Server running on port ${PORT}`);
});
