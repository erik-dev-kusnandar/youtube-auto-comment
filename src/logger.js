const winston = require("winston");
// src/logger.js
const { createLogger, format, transports } = require("winston");
const path = require("path");
const logsDir = path.join(__dirname, "../logs");
const fs = require("fs");
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir);

// const logger = createLogger({
//   level: "info",
//   format: format.combine(format.timestamp(), format.printf((i) => `${i.timestamp} [${i.level}] ${i.message}`)),
//   transports: [new transports.Console(), new transports.File({ filename: path.join(logsDir, "app.log") })],
// });
// module.exports = logger;

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(
      (info) => `${info.timestamp} [${info.level}] ${info.message}`
    )
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: "logs/app.log" }),
  ],
});

module.exports = logger;
