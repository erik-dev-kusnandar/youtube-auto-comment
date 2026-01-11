const appiumEngine = require("./appiumEngine");
const webEngine = require("./webEngine");

const engines = {
    appium: appiumEngine,
    web: webEngine
};

function getEngine(method) {
    return engines[method] || webEngine;
}

module.exports = { getEngine };
