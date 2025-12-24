const fs = require("fs");
const path = require("path");

const defaultConfig = JSON.parse(
  fs.readFileSync(path.join(__dirname, "./config.json"))
);

module.exports = defaultConfig;
