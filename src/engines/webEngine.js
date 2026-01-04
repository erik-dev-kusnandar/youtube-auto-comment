const puppeteer = require("puppeteer");
const logger = require("../logger");
const path = require("path");
const fs = require("fs");

class WebEngine {
    constructor() {
        this.browser = null;
    }

    async post(videoId, text, opts = {}) {
        logger.info(`[WebEngine] Starting web post for ${videoId}`);

        const userDataDir = path.join(process.cwd(), "puppeteer_data");
        const logsDir = path.join(process.cwd(), "logs");
        if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

        let browser;

        try {
            browser = await puppeteer.launch({
                headless: opts.headless !== undefined ? opts.headless : "new",
                args: [
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-blink-features=AutomationControlled",
                    "--window-size=1280,800"
                ],
                userDataDir
            });

            const page = await browser.newPage();
            await page.setViewport({ width: 1280, height: 800 });

            // Mask automation
            await page.evaluateOnNewDocument(() => {
                Object.defineProperty(navigator, "webdriver", { get: () => false });
            });

            const url = `https://www.youtube.com/watch?v=${videoId}`;
            logger.info(`[WebEngine] Navigating to ${url}`);
            await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

            // 1. Wait and Scroll (Lazy Load)
            logger.info("[WebEngine] Waiting for page and scrolling...");

            // Random initial delay to simulate human "looking" at the page
            await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));

            for (let i = 0; i < 5; i++) {
                await page.evaluate(() => window.scrollBy(0, 500));
                // Randomize scroll delay
                await new Promise(r => setTimeout(r, 1000 + Math.random() * 1000));
            }

            try {
                await page.waitForSelector("#comments", { timeout: 15000 });
                logger.info("[WebEngine] Comments section container found.");
            } catch (e) {
                logger.warn("[WebEngine] #comments selector not found, attempting one big scroll.");
                await page.evaluate(() => window.scrollBy(0, 1500));
                await new Promise(r => setTimeout(r, 3000));
            }

            // Verify login status via avatar
            const avatarFound = await page.$("yt-img-shadow#avatar") !== null;
            if (!avatarFound) {
                logger.warn("[WebEngine] User avatar not found. This might indicate the session in 'puppeteer_data' has expired or is invalid for Linux.");
            }

            // 2. Click comment box
            const commentSelectors = [
                "div#placeholder-area",
                "yt-formatted-string#simplebox-placeholder",
                "#simplebox-placeholder",
                "ytd-comment-simplebox-renderer",
                "#contenteditable-root"
            ];

            let clicked = false;
            for (const selector of commentSelectors) {
                try {
                    const element = await page.waitForSelector(selector, { timeout: 4000, visible: true });
                    if (element) {
                        // Use evaluate for a more "native" click if standard click fails
                        await page.evaluate(el => el.click(), element);
                        clicked = true;
                        logger.info(`[WebEngine] Clicked comment box via: ${selector}`);
                        break;
                    }
                } catch (e) { continue; }
            }

            if (!clicked) {
                const ss = path.join(logsDir, `fail_find_box_${videoId}.png`);
                await page.screenshot({ path: ss, fullPage: true });
                throw new Error("Could not find comment box. Check 'logs' for screenshot. Is your YouTube account restricted or session expired?");
            }

            // Wait for input to be ready after click
            await new Promise(r => setTimeout(r, 3000));

            // 3. Type text (Human delay)
            logger.info("[WebEngine] Typing comment...");
            const inputSelectors = [
                "#contenteditable-root",
                "div#contenteditable-root[contenteditable='true']",
                "[aria-label='Add a comment...']",
                "#contenteditable-textarea"
            ];

            let inputElement = null;
            let usedSelector = "";
            for (const sel of inputSelectors) {
                try {
                    inputElement = await page.waitForSelector(sel, { timeout: 4000, visible: true });
                    if (inputElement) {
                        usedSelector = sel;
                        logger.info(`[WebEngine] Found input element via: ${sel}`);
                        break;
                    }
                } catch (e) { continue; }
            }

            if (!inputElement) {
                const ss = path.join(logsDir, `fail_input_box_${videoId}.png`);
                await page.screenshot({ path: ss, fullPage: true });
                throw new Error("Could not find typing area. Check 'logs' for screenshot.");
            }

            await inputElement.focus();

            // Clear
            await page.evaluate((el) => {
                if (el) el.textContent = "";
            }, inputElement);

            await page.keyboard.type(text, { delay: 100 });
            await new Promise(r => setTimeout(r, 1500));

            // 4. Submit
            logger.info("[WebEngine] Finding submit button...");
            const submitBtnSelectors = [
                "ytd-button-renderer#submit-button",
                "#submit-button ytd-button-renderer",
                "#submit-button button[aria-label='Comment']",
                "#submit-button"
            ];

            let submitted = false;
            for (const sel of submitBtnSelectors) {
                try {
                    const btn = await page.$(sel);
                    if (btn) {
                        const isEnabled = await page.evaluate(el => {
                            const b = el.querySelector('button') || el;
                            return b && !b.hasAttribute('disabled') && b.getAttribute('aria-disabled') !== 'true';
                        }, btn);

                        if (isEnabled) {
                            await btn.click();
                            submitted = true;
                            logger.info(`[WebEngine] Submitted via: ${sel}`);
                            break;
                        }
                    }
                } catch (e) { continue; }
            }

            if (!submitted) {
                const ss = path.join(logsDir, `fail_submit_${videoId}.png`);
                await page.screenshot({ path: ss, fullPage: true });
                throw new Error("Comment button not found or disabled. Check if your account is restricted.");
            }

            // 5. Verification
            logger.info("[WebEngine] Verifying post...");
            await new Promise(r => setTimeout(r, 10000)); // Robust wait

            const stillInBox = await page.evaluate((sel) => {
                const el = document.querySelector(sel);
                return el && el.textContent.trim().length > 0;
            }, usedSelector || "#contenteditable-root");

            if (stillInBox) {
                const ss = path.join(logsDir, `verify_failed_${videoId}.png`);
                await page.screenshot({ path: ss, fullPage: true });
                throw new Error("Comment verification failed: Text still remains in input box after submit.");
            }

            logger.info("[WebEngine] Post verified successfully!");
            return {
                status: "success",
                moderationStatus: "published",
                engine: "web",
                message: "Posted & Verified via Puppeteer"
            };

        } catch (e) {
            logger.error(`[WebEngine] Error: ${e.message}`);
            return { status: "error", message: e.message, engine: "web" };
        } finally {
            if (browser) await browser.close();
        }
    }

    async setupLogin() {
        logger.info("[WebEngine] Opening browser for manual login...");
        const userDataDir = path.join(process.cwd(), "puppeteer_data");
        if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });

        try {
            const browser = await puppeteer.launch({
                headless: false,
                args: [
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-blink-features=AutomationControlled"
                ],
                userDataDir
            });

            const page = await browser.newPage();
            await page.setViewport({ width: 1280, height: 800 });
            await page.goto("https://www.youtube.com", { waitUntil: "networkidle2" });

            return new Promise((resolve) => {
                browser.on("disconnected", () => {
                    logger.info("[WebEngine] Browser closed by user.");
                    resolve({ ok: true });
                });
            });
        } catch (e) {
            logger.error(`[WebEngine] Setup login failed: ${e.message}`);
            throw e;
        }
    }
}

module.exports = new WebEngine();
