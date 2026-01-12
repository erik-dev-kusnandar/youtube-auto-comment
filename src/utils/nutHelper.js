const { mouse, keyboard, Button, Point, straightTo, sleep } = require("@nut-tree-fork/nut-js");
const logger = require("../logger");

class NutHelper {
    constructor() {
        // Configure nut.js
        mouse.config.mouseSpeed = 600; // Pixels per second
    }

    /**
     * Map viewport relative coordinates to screen coordinates
     * @param {Object} page - Puppeteer page
     * @param {Object} box - Element bounding box {x, y, width, height}
     * @returns {Promise<Point>}
     */
    async getScreenPoint(page, box) {
        const offset = await page.evaluate(() => {
            return {
                screenX: window.screenX,
                screenY: window.screenY,
                outerWidth: window.outerWidth,
                outerHeight: window.outerHeight,
                innerWidth: window.innerWidth,
                innerHeight: window.innerHeight,
                devicePixelRatio: window.devicePixelRatio
            };
        });

        logger.info(`[NutHelper] Window Offsets: screenX=${offset.screenX}, screenY=${offset.screenY}, outer=${offset.outerWidth}x${offset.outerHeight}, inner=${offset.innerWidth}x${offset.innerHeight}, dpr=${offset.devicePixelRatio}`);

        // CSS pixel offsets within the window
        const chromeHeight = offset.outerHeight - offset.innerHeight;
        const chromeWidth = (offset.outerWidth - offset.innerWidth) / 2;

        // target = screenPosition + (chromeOffset + elementPosition) * devicePixelRatio
        // Note: box.x/y/width/height are in CSS pixels from Puppeteer
        const targetX = offset.screenX + (chromeWidth + box.x + (box.width / 2)) * offset.devicePixelRatio;
        const targetY = offset.screenY + (chromeHeight + box.y + (box.height / 2)) * offset.devicePixelRatio;

        return new Point(targetX, targetY);
    }

    /**
     * Move mouse to element and click
     * @param {Object} page - Puppeteer page
     * @param {string} selector - CSS selector
     */
    async moveAndClick(page, selectorOrElement) {
        try {
            let element;
            if (typeof selectorOrElement === 'string') {
                element = await page.waitForSelector(selectorOrElement, { visible: true, timeout: 5000 });
            } else {
                element = selectorOrElement;
            }

            if (!element) throw new Error(`Element not found`);

            const box = await element.boundingBox();
            if (!box) throw new Error(`Could not get bounding box`);

            const point = await this.getScreenPoint(page, box);

            logger.info(`[NutHelper] Moving mouse to screen coords: ${point.x}, ${point.y}`);

            // Move in a human-like way 
            await mouse.move(straightTo(point));
            await sleep(200);
            await mouse.click(Button.LEFT);

            return true;
        } catch (error) {
            logger.error(`[NutHelper] Click failed: ${error.message}`);
            return false;
        }
    }

    /**
     * Type text human-like
     * @param {string} text 
     */
    async type(text) {
        logger.info(`[NutHelper] Typing: ${text.substring(0, 20)}...`);
        for (const char of text) {
            await keyboard.type(char);
            // Random delay between 50ms and 150ms
            const delay = Math.floor(Math.random() * 100) + 50;
            await sleep(delay);

            // Occasional longer pause
            if (Math.random() > 0.95) {
                await sleep(500 + Math.random() * 1000);
            }
        }
    }
}

module.exports = new NutHelper();
