const { chromium } = require("playwright");

const logger = require("../logger");
const path = require("path");
const fs = require("fs");
const { execSync, spawn } = require("child_process");
const { syncProfile } = require("../../scripts/copy-profile");

const CDP_ENDPOINT = process.env.CDP_ENDPOINT || "http://127.0.0.1:9222";
const CHROME_EXE =
    process.env.CHROME_EXE ||
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const REAL_PROFILE =
    process.env.CHROME_SOURCE ||
    path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "User Data");

// Re-sync the Chrome profile if it doesn't exist OR is older than this threshold.
const PROFILE_SYNC_MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12 hours

// Hide automation fingerprints (Mimic technique from compliance-guard)
const STEALTH_SCRIPT = `
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  Object.defineProperty(navigator, 'plugins', {
    get: () => {
      const p = [
        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
        { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
      ];
      p.length = 3;
      return p;
    },
  });
  Object.defineProperty(navigator, 'languages', { get: () => ['id-ID', 'id', 'en-US', 'en'] });
  Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
  Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
  window.chrome = {
    runtime: {
      PlatformOs: { MAC: 'mac', WIN: 'win', ANDROID: 'android', CROS: 'cros', LINUX: 'linux', OPENBSD: 'openbsd' },
      connect: function() {},
      sendMessage: function() {},
    },
    loadTimes: function() { return {}; },
    csi: function() { return {}; },
  };
`;

const randomDelay = (min, max) => new Promise(r => setTimeout(r, min + Math.random() * (max - min)));

class WebEngine {
    constructor() {
        this.browser = null;
        // Must match ACCOUNT in copy-profile.js (default = "default")
        this.account = process.env.ACCOUNT_NAME || "default";
    }

    getProfileDir() {
        return path.join(process.cwd(), "puppeteer_data", this.account);
    }

    getCookiePath() {
        return this.account
            ? path.join(process.cwd(), "data", `youtube_cookies_${this.account}.json`)
            : path.join(process.cwd(), "data", "youtube_cookies.json");
    }

    /** Check whether the puppeteer profile needs a fresh sync from the live Chrome. */
    _needsSync() {
        const profileDir = this.getProfileDir();
        if (!fs.existsSync(profileDir)) return true;

        // Check timestamp file written by syncProfile()
        const tsFile = path.join(profileDir, ".last_sync");
        if (!fs.existsSync(tsFile)) {
            // Legacy: check old last_sync.txt too
            const oldTs = path.join(profileDir, "last_sync.txt");
            if (!fs.existsSync(oldTs)) return true;
            try {
                const age = Date.now() - new Date(fs.readFileSync(oldTs, "utf8").trim()).getTime();
                return age > PROFILE_SYNC_MAX_AGE_MS;
            } catch { return true; }
        }

        try {
            const age = Date.now() - parseInt(fs.readFileSync(tsFile, "utf8").trim(), 10);
            return age > PROFILE_SYNC_MAX_AGE_MS;
        } catch { return true; }
    }

    /** Auto-copy the running Chrome profile into puppeteer_data if needed. */
    async _autoSyncProfile() {
        if (!this._needsSync()) {
            logger.info("[WebEngine] Profile already up-to-date, skipping sync.");
            return;
        }
        logger.info("[WebEngine] Auto-syncing Chrome profile (copying from live Chrome)...");
        try {
            const result = await syncProfile({ silent: false });
            if (result.ok) {
                logger.info(`[WebEngine] Profile sync OK — ${result.message}`);
                if (result.skippedLocked) {
                    logger.warn("[WebEngine] Some files were locked (Chrome running). Login state from Playwright persistent context will still be used.");
                }
            } else {
                logger.warn(`[WebEngine] Profile sync failed: ${result.message}. Continuing with existing profile.`);
            }
        } catch (e) {
            logger.warn(`[WebEngine] Profile sync error: ${e.message}. Continuing with existing profile.`);
        }
    }

    async _launch(opts = {}) {
        // 🔄 Auto-sync Chrome profile before launching (no manual setup required)
        await this._autoSyncProfile();

        const profileDir = this.getProfileDir();
        if (!fs.existsSync(profileDir)) {
            fs.mkdirSync(profileDir, { recursive: true });
            logger.info(`[WebEngine] New profile dir created: ${profileDir}`);
        }

        const headless = opts.headless !== undefined ? !!opts.headless : false;

        const context = await chromium.launchPersistentContext(profileDir, {
            headless,
            channel: "chrome", // use the REAL installed Chrome
            viewport: { width: 1280, height: 800 },
            locale: "id-ID",
            timezoneId: "Asia/Jakarta",
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-blink-features=AutomationControlled",
                "--disable-infobars",
                "--disable-dev-shm-usage",
                "--window-size=1280,800"
            ]
        });

        // Apply stealth to every page (current + future tabs)
        for (const p of context.pages()) {
            p.addInitScript(STEALTH_SCRIPT).catch(() => {});
        }
        context.on("page", (page) => {
            page.addInitScript(STEALTH_SCRIPT).catch(() => {});
        });

        return context;
    }

    async _loadCookies(context) {
        // Disabled manually importing json cookies to prevent overwriting/corrupting 
        // the active session already present in the copied persistent Chrome profile database.
        logger.info(`[WebEngine] Using persistent profile state from: ${this.getProfileDir()}`);
        return;
    }

    /**
     * Connect to the user's ACTIVE Chrome via CDP.
     * If Chrome isn't running with --remote-debugging-port yet, restart it
     * (same real profile) with the debug port so we can drive it like a normal browser.
     */
    async _ensureCDP() {
        // 1) Try connecting to an already-open CDP Chrome
        try {
            const browser = await chromium.connectOverCDP(CDP_ENDPOINT);
            logger.info(`[WebEngine] Connected to active Chrome via CDP (${CDP_ENDPOINT})`);
            return browser;
        } catch (e) {
            logger.info("[WebEngine] CDP Chrome not running — starting Chrome with remote debugging...");
        }

        // 2) Restart real Chrome with debug port (frees profile lock + enables control)
        try {
            execSync("taskkill /IM chrome.exe /F", { stdio: "ignore" });
            logger.info("[WebEngine] Closed existing chrome.exe to enable CDP control.");
        } catch (e) {
            logger.info("[WebEngine] No chrome.exe was running.");
        }
        await new Promise(r => setTimeout(r, 1500));

        if (!fs.existsSync(CHROME_EXE)) {
            throw new Error(`Chrome not found at ${CHROME_EXE}. Set CHROME_EXE in .env`);
        }

        const args = [
            `--remote-debugging-port=9222`,
            `--user-data-dir=${REAL_PROFILE}`,
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-blink-features=AutomationControlled",
            "--start-maximized"
        ];
        logger.info(`[WebEngine] Starting real Chrome with CDP: ${CHROME_EXE}`);
        const child = spawn(CHROME_EXE, args, { detached: true, stdio: "ignore" });
        child.unref();

        // 3) Wait until the debug port is ready
        for (let i = 0; i < 40; i++) {
            await new Promise(r => setTimeout(r, 1000));
            try {
                const browser = await chromium.connectOverCDP(CDP_ENDPOINT);
                logger.info("[WebEngine] Chrome started with CDP (port 9222) — connected.");
                return browser;
            } catch (e) { /* keep waiting */ }
        }
        throw new Error("Chrome CDP not ready after 40s. Make sure Chrome is installed at the default path.");
    }

    async _saveCookies(context) {
        try {
            const cookies = await context.cookies();
            const hasAuth = Array.isArray(cookies) && cookies.some(c => c.name === "LOGIN_INFO" || c.name === "SID");
            if (hasAuth) {
                const dataDir = path.join(process.cwd(), "data");
                if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
                fs.writeFileSync(this.getCookiePath(), JSON.stringify(cookies, null, 2));
                logger.info("[WebEngine] Logged-in auth cookies saved to JSON backup.");
            }
        } catch (e) {
            // Silently skip if closing
        }
    }

    async post(videoId, text, opts = {}) {
        logger.info(`[WebEngine] Starting web post for ${videoId} with Stealth Mode ON (Mimic/Playwright)`);

        const logsDir = path.join(process.cwd(), "logs");
        if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

        let context = null;
        let cdpBrowser = null;
        let cdpMode = false;
        let page = null;

        try {
            // Prefer posting inside the user's ACTIVE Chrome (started via CDP button).
            // Falls back to a standalone persistent-context Chrome.
            try {
                cdpBrowser = await chromium.connectOverCDP(CDP_ENDPOINT);
                cdpMode = true;
                logger.info("[WebEngine] Posting inside ACTIVE Chrome via CDP");
            } catch (e) {
                cdpMode = false;
            }

            if (cdpMode) {
                const ctxt = cdpBrowser.contexts()[0];
                page = await ctxt.newPage();
            } else {
                context = await this._launch(opts);
                page = context.pages()[0] || await context.newPage();
            }

            const activeContext = cdpMode ? cdpBrowser.contexts()[0] : context;

            await this._loadCookies(activeContext);

            const url = `https://www.youtube.com/watch?v=${videoId}`;
            logger.info(`[WebEngine] Navigating to ${url}`);
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
            await randomDelay(2000, 5000);

            // Auto-save auth session cookies if logged in
            await this._saveCookies(activeContext);

            // Check if YouTube is logged in
            const isLoggedOut = await page.evaluate(() => {
                const signInBtn = document.querySelector("a[href*='accounts.google.com']") ||
                    document.querySelector("ytd-button-renderer#buttons a[aria-label*='Sign in']") ||
                    document.querySelector("ytd-button-renderer#buttons a[aria-label*='Login']");
                return !!signInBtn;
            });

            if (isLoggedOut) {
                logger.warn("[WebEngine] ⚠️ YOUTUBE IS NOT LOGGED IN! Please click '🔑 Login Manual 1x (Buka Browser Mimic)' in UI to login once permanently.");
            } else {
                logger.info("[WebEngine] ✅ YouTube session active and logged in.");
            }

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
                logger.info(`[WebEngine] Scraped Context: ${(scrapedMetadata.title || "").substring(0, 40)}...`);
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

            // Human-like scrolling to trigger lazy load
            for (let i = 0; i < 5; i++) {
                const scrollAmount = 300 + Math.floor(Math.random() * 400);
                await page.evaluate((amt) => window.scrollBy(0, amt), scrollAmount);
                await randomDelay(1500, 3500);
            }

            try {
                await page.waitForSelector("#comments", { timeout: 15000 });
                logger.info("[WebEngine] Comments section container found.");
            } catch (e) {
                logger.warn("[WebEngine] #comments selector not found, attempting one big scroll.");
                await page.evaluate(() => window.scrollBy(0, 1500));
                await randomDelay(2000, 4000);
            }

            await randomDelay(2000, 4000);

            // 2. Click comment box placeholder to reveal real input
            logger.info("[WebEngine] Clicking comment placeholder...");
            const placeholderSelectors = [
                "ytd-comment-simplebox-renderer",
                "#simplebox-placeholder",
                "yt-formatted-string#simplebox-placeholder",
                "#placeholder-area"
            ];

            let clickedPlaceholder = false;
            for (const sel of placeholderSelectors) {
                try {
                    const placeholder = await page.waitForSelector(sel, { timeout: 5000, state: "visible" });
                    if (placeholder) {
                        await placeholder.click();
                        clickedPlaceholder = true;
                        logger.info(`[WebEngine] Clicked placeholder via: ${sel}`);
                        break;
                    }
                } catch (e) { continue; }
            }

            if (!clickedPlaceholder) {
                logger.warn("[WebEngine] Could not click placeholder, attempting direct search for input area.");
            }

            await randomDelay(1500, 3000);

            // 3. Type text (Human delay)
            logger.info("[WebEngine] Typing comment...");
            const inputSelectors = [
                "#contenteditable-root",
                "div#contenteditable-root[contenteditable='true']",
                "[aria-label='Add a comment...']",
                "[aria-label='Tambahkan komentar...']",
                "#contenteditable-textarea",
                "ytd-commentbox #contenteditable-root"
            ];

            let inputElement = null;
            let usedSelector = "";
            for (const sel of inputSelectors) {
                try {
                    inputElement = await page.waitForSelector(sel, { timeout: 5000, state: "visible" });
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

            await page.evaluate((el) => {
                if (el) el.textContent = "";
            }, inputElement);

            // Human-like typing with variation
            for (const char of text) {
                if (char === "\n") {
                    await page.keyboard.press("Enter");
                } else if (char === "\r") {
                    continue;
                } else {
                    try {
                        await page.keyboard.type(char, { delay: 0 });
                    } catch (e) {
                        await page.keyboard.insertText(char);
                    }
                }

                const charDelay = 40 + Math.random() * 110;
                await new Promise(r => setTimeout(r, charDelay));

                if (Math.random() > 0.97) {
                    await randomDelay(800, 2000);
                }
            }

            await randomDelay(2000, 4000);

            // 4. Submit
            logger.info("[WebEngine] Finding submit button...");
            const submitBtnSelectors = [
                "ytd-button-renderer#submit-button",
                "#submit-button ytd-button-renderer",
                "#submit-button button[aria-label='Comment']",
                "#submit-button button[aria-label='Komentar']",
                "#submit-button button",
                "ytd-button-renderer.ytd-commentbox#submit-button"
            ];

            let submitted = false;
            for (const sel of submitBtnSelectors) {
                try {
                    const btn = await page.waitForSelector(sel, { timeout: 3000, state: "visible" });
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
                        } else {
                            logger.warn(`[WebEngine] Submit button found via ${sel} but it is DISABLED.`);
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
            await new Promise(r => setTimeout(r, 10000));

            const stillInBox = await page.evaluate((sel) => {
                const el = document.querySelector(sel);
                return el && el.textContent.trim().length > 0;
            }, usedSelector || "#contenteditable-root");

            if (stillInBox) {
                const ss = path.join(logsDir, `verify_failed_${videoId}.png`);
                await page.screenshot({ path: ss, fullPage: true });
                throw new Error("Comment verification failed: Text still remains in input box after submit.");
            }

            // Secondary verification: check if comment appears in list
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

            await page.evaluate(() => window.scrollBy(0, -300));

            logger.info("[WebEngine] Post verified successfully!");
            return {
                status: "success",
                moderationStatus: "published",
                engine: "web",
                message: "Posted & Verified via Playwright Mimic"
            };

        } catch (e) {
            logger.error(`[WebEngine] Error: ${e.message}`);
            return { status: "error", message: e.message, engine: "web" };
        } finally {
            if (cdpMode) {
                // Only close our own tab — NEVER the user's whole Chrome.
                if (page) await page.close().catch(() => {});
            } else {
                if (context) await context.close().catch(() => {});
            }
        }
    }

    async openNewWindow(targetUrl = "https://www.youtube.com") {
        logger.info(`[WebEngine] Opening new tab/window for: ${targetUrl}`);

        // Prefer the ACTIVE Chrome — restart it with CDP if needed, then open a new tab.
        try {
            const browser = await this._ensureCDP();
            const context = browser.contexts()[0];
            const page = await context.newPage();
            await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
            logger.info("[WebEngine] New tab opened in ACTIVE Chrome via CDP!");
            return { ok: true, mode: "cdp", message: "Tab baru dibuka di Chrome aktif (port 9222)" };
        } catch (e) {
            logger.warn(`[WebEngine] CDP unavailable (${e.message}); falling back to standalone window...`);
        }

        // Fallback: standalone visual Chrome window
        try {
            const context = await this._launch({ headless: false });
            const page = context.pages()[0] || await context.newPage();
            await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
            logger.info("[WebEngine] Standalone Chrome window opened successfully!");
            return { ok: true, mode: "launch", message: "Visual Chrome window opened (fallback)" };
        } catch (e) {
            logger.error(`[WebEngine] Failed to open new window: ${e.message}`);
            throw e;
        }
    }

    async setupLogin() {
        logger.info("[WebEngine] Opening browser for manual login (Mimic/Playwright)...");
        const profileDir = this.getProfileDir();
        if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true });

        let context = null;
        try {
            context = await this._launch({ headless: false });

            const page = context.pages()[0] || await context.newPage();
            await page.goto("https://www.youtube.com", { waitUntil: "domcontentloaded" });

            // 🍪 Periodic Save (Every 5s)
            const saveInterval = setInterval(async () => {
                try {
                    const cookies = await context.cookies();
                    const dataDir = path.join(process.cwd(), "data");
                    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
                    fs.writeFileSync(this.getCookiePath(), JSON.stringify(cookies, null, 2));
                } catch (e) {
                    // Silently fail if page is closing/closed
                }
            }, 5000);

            return new Promise((resolve) => {
                context.on("close", () => {
                    clearInterval(saveInterval);
                    logger.info("[WebEngine] Browser closed by user.");
                    resolve({ ok: true });
                });
            });
        } catch (e) {
            logger.error(`[WebEngine] Setup login failed: ${e.message}`);
            if (context) await context.close().catch(() => {});
            throw e;
        }
    }
}

module.exports = new WebEngine();
