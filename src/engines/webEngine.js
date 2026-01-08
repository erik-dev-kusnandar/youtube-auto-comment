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
                    "--disable-features=IsolateOrigins,site-per-process",
                    "--window-size=1280,800"
                ],
                userDataDir
            });

            const page = await browser.newPage();
            await page.setViewport({ width: 1280, height: 800 });

            // 🍪 Load Cookies if exist
            const cookiePath = path.join(process.cwd(), "data", "youtube_cookies.json");
            if (fs.existsSync(cookiePath)) {
                try {
                    const cookies = JSON.parse(fs.readFileSync(cookiePath));
                    await page.setCookie(...cookies);
                    logger.info("[WebEngine] Cookies loaded successfully");
                } catch (e) {
                    logger.error(`[WebEngine] Failed to load cookies: ${e.message}`);
                }
            } else {
                logger.warn(`[WebEngine] youtube_cookies.json NOT FOUND at ${cookiePath}. Browser will start in Guest mode (Logged out).`);
            }

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

            // ✅ [SMART ENGINE] Scrape Metadata (Title & Description) from DOM
            let scrapedMetadata = null;
            try {
                scrapedMetadata = await page.evaluate(() => {
                    const titleEl = document.querySelector("h1.ytd-watch-metadata") ||
                        document.querySelector("#title h1") ||
                        document.querySelector("div[id='title']");

                    const descEl = document.querySelector("#description-inline-expander") ||
                        document.querySelector("#description");

                    return {
                        title: titleEl ? titleEl.textContent.trim() : "",
                        description: descEl ? descEl.textContent.trim() : ""
                    };
                });
                logger.info(`[WebEngine] Scraped Context: ${scrapedMetadata.title.substring(0, 40)}...`);
            } catch (e) {
                logger.warn(`[WebEngine] Failed to scrape metadata: ${e.message}`);
            }

            // ✅ [SMART ENGINE] AI Generation Step
            if (opts.aiCallback && scrapedMetadata && scrapedMetadata.title) {
                logger.info("[WebEngine] Generating AI comment from scraped context...");
                try {
                    const aiText = await opts.aiCallback(scrapedMetadata);
                    if (aiText) {
                        text = aiText;
                        logger.info(`[WebEngine] AI Comment Generated: ${text.substring(0, 50)}...`);
                    }
                } catch (e) {
                    logger.error(`[WebEngine] AI Callback failed: ${e.message}`);
                }
            }


            for (let i = 0; i < 5; i++) {
                const scrollAmount = 300 + Math.floor(Math.random() * 400);
                await page.evaluate((amt) => window.scrollBy(0, amt), scrollAmount);
                // Randomize scroll delay
                await new Promise(r => setTimeout(r, 1500 + Math.random() * 2000));
            }

            try {
                await page.waitForSelector("#comments", { timeout: 15000 });
                logger.info("[WebEngine] Comments section container found.");
            } catch (e) {
                logger.warn("[WebEngine] #comments selector not found, attempting one big scroll.");
                await page.evaluate(() => window.scrollBy(0, 1500));
                await new Promise(r => setTimeout(r, 3000));
            }

            // Wait for input to be ready
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

            // [IMPROVEMENT] Human-like typing with variation
            for (const char of text) {
                await page.keyboard.sendCharacter(char);
                // Faster typing with occasional mistakes simulation would be here but for now just random delay
                await new Promise(r => setTimeout(r, 40 + Math.random() * 120));

                // Random pause
                if (Math.random() > 0.96) {
                    await new Promise(r => setTimeout(r, 800 + Math.random() * 1500));
                }
            }
            // Delay before clicking submit button
            await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));

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

            // [IMPROVEMENT] Second layer verification: Check if comment appears in list
            logger.info("[WebEngine] Secondary verification: checking if comment is in list...");
            await new Promise(r => setTimeout(r, 8000));
            const commentAppeared = await page.evaluate((txt) => {
                const comments = Array.from(document.querySelectorAll("#content-text"));
                return comments.some(c => c.textContent.includes(txt.trim()));
            }, text);

            if (!commentAppeared) {
                logger.warn("[WebEngine] Comment not found in recent comments. It might be 'Held for Review' or shadowbanned.");
                return {
                    status: "success",
                    moderationStatus: "held_for_review",
                    engine: "web",
                    message: "Posted but NOT visible in list (likely Held for Review/Shadowbanned)"
                };
            }

            // [ADVANCED EVASION] 6. Post-Post Stay
            const stayTime = 10000 + Math.random() * 10000;
            logger.info(`[WebEngine] Post-post stay: ${Math.round(stayTime / 1000)}s to simulate user interaction after posting.`);
            await new Promise(r => setTimeout(r, stayTime));

            // Final erratic scroll
            await page.evaluate(() => window.scrollBy(0, -300));

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

            // 🍪 Periodic Save (Every 5s) because 'disconnected' event is too late to fetch cookies
            const saveInterval = setInterval(async () => {
                try {
                    const cookies = await page.cookies();
                    const dataDir = path.join(process.cwd(), "data");
                    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
                    fs.writeFileSync(path.join(dataDir, "youtube_cookies.json"), JSON.stringify(cookies, null, 2));
                } catch (e) {
                    // Silently fail if page is closing/closed
                }
            }, 5000);

            return new Promise((resolve) => {
                browser.on("disconnected", () => {
                    clearInterval(saveInterval);
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
