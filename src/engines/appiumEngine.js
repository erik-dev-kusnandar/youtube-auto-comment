const { remote } = require("webdriverio");
const logger = require("../logger");

class AppiumEngine {
    constructor() {
        this.driver = null;
    }

    async _getDriver(deviceId) {
        const opts = {
            hostname: "127.0.0.1",
            port: 4723,
            path: "/",
            capabilities: {
                platformName: "Android",
                "appium:automationName": "UiAutomator2",
                "appium:deviceName": deviceId || "Android",
                "appium:noReset": true, // Keep the user logged in
                "appium:newCommandTimeout": 3600,
                "appium:appPackage": "com.google.android.youtube",
                "appium:appActivity": "com.google.android.apps.youtube.app.watchwaitlist.WatchWaitListActivity", // Generic launcher
            },
        };
        return await remote(opts);
    }

    async post(videoId, text, opts = {}) {
        const deviceId = opts.deviceId || "emulator-5554";
        logger.info(`[AppiumEngine] Starting mobile post for ${videoId} on ${deviceId}`);

        let driver;
        try {
            driver = await this._getDriver(deviceId);

            // 1. Open video via Deep Link
            logger.info(`[AppiumEngine] Opening video via Deep Link: ${videoId}`);
            await driver.execute("mobile: deepLink", {
                url: `vnd.youtube:${videoId}`,
                package: "com.google.android.youtube",
            });

            await driver.pause(5000); // Wait for video to load

            // 2. Scroll to Comment Section
            logger.info("[AppiumEngine] Searching for comment section...");

            // Scroll down to reveal comments
            await driver.execute("mobile: scrollGesture", {
                left: 200, top: 200, width: 600, height: 1000,
                direction: "down",
                percent: 1.0
            });

            // Look for "Add a comment"
            const commentBox = await driver.$('//*[contains(@text, "Add a comment")]');
            await commentBox.waitForDisplayed({ timeout: 10000 });
            await commentBox.click();

            logger.info("[AppiumEngine] Typing comment...");

            // Wait for keyboard/input
            const inputField = await driver.$('//android.widget.EditText');
            await inputField.waitForDisplayed({ timeout: 5000 });
            await inputField.setValue(text);

            // 3. Click Send
            const sendBtn = await driver.$('//android.widget.ImageView[@content-desc="Send"]');
            if (await sendBtn.isExisting()) {
                await sendBtn.click();
            } else {
                // Fallback resource id
                const sendBtnFallback = await driver.$('//*[@resource-id="com.google.android.youtube:id/send_button"]');
                await sendBtnFallback.click();
            }

            logger.info("[AppiumEngine] Comment sent successfully!");
            await driver.pause(2000);

            return {
                status: "success",
                moderationStatus: "published",
                engine: "appium",
                message: `Posted via Android App (${deviceId})`
            };

        } catch (e) {
            logger.error(`[AppiumEngine] Mobile post failed: ${e.message}`);
            return {
                status: "error",
                message: e.message,
                engine: "appium"
            };
        } finally {
            if (driver) {
                await driver.deleteSession();
            }
        }
    }

    async testConnection(deviceId) {
        logger.info(`[AppiumEngine] Testing connection to ${deviceId}`);
        let driver;
        try {
            driver = await this._getDriver(deviceId);
            // If we can get a session, it's connected
            return true;
        } catch (e) {
            logger.error(`[AppiumEngine] Connection test failed: ${e.message}`);
            return false;
        } finally {
            if (driver) await driver.deleteSession();
        }
    }
}

module.exports = new AppiumEngine();
