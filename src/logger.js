// const winston = require("winston");
// require("winston-daily-rotate-file");
// const path = require("path");

// const transport = new winston.transports.DailyRotateFile({
//   filename: path.join("logs", "app-%DATE%.log"),
//   datePattern: "YYYY-MM-DD",
//   zippedArchive: false,
//   maxFiles: "14d"
// });

// const logger = winston.createLogger({
//   level: "info",
//   format: winston.format.combine(
//     winston.format.timestamp(),
//     winston.format.printf(({ timestamp, level, message }) => {
//       return `${timestamp} [${level}] ${message}`;
//     })
//   ),
//   transports: [transport, new winston.transports.Console()]
// });

// module.exports = logger;

const winston = require("winston");

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
