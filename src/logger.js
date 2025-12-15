// src/logger.js
const winston = require("winston");
const path = require("path");
const fs = require("fs");

const logsDir = path.join(__dirname, "../logs");
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(i => `${i.timestamp} [${i.level}] ${i.message}`)
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: path.join(logsDir, "app.log") })
  ],
});

module.exports = logger;
