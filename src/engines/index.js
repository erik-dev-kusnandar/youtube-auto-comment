const apiEngine = require("./apiEngine");
const appiumEngine = require("./appiumEngine");
const webEngine = require("./webEngine");

const engines = {
    api: apiEngine,
    appium: appiumEngine,
    web: webEngine
};

function getEngine(method) {
    return engines[method] || apiEngine;
}

module.exports = { getEngine };
