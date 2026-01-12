// webEngine.js - WITH ACCOUNT WARMING SYSTEM

const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");

const stealth = StealthPlugin();
stealth.enabledEvasions.delete('iframe.contentWindow');
stealth.enabledEvasions.delete('media.codecs');
puppeteer.use(stealth);

const logger = require("../logger");
const path = require("path");
const fs = require("fs");
const { log } = require("console");

class WebEngine {
    constructor() {
        this.browser = null;
        this.warmingState = this.loadWarmingState();
    }

    // ✅ WARMING STATE PERSISTENCE
    loadWarmingState() {
        const statePath = path.join(process.cwd(), "data", "warming_state.json");
        if (fs.existsSync(statePath)) {
            try {
                return JSON.parse(fs.readFileSync(statePath, 'utf-8'));
            } catch (e) {
                return {};
            }
        }
        return {};
    }

    saveWarmingState() {
        const statePath = path.join(process.cwd(), "data", "warming_state.json");
        const dataDir = path.dirname(statePath);
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
        fs.writeFileSync(statePath, JSON.stringify(this.warmingState, null, 2));
    }

    // ✅ CHECK IF ACCOUNT NEEDS WARMING
    needsWarming(accountId = 'default') {
        const state = this.warmingState[accountId];
        if (!state) return true;

        const now = Date.now();
        const lastWarmed = state.lastWarmed || 0;
        const hoursSinceWarming = (now - lastWarmed) / (1000 * 60 * 60);

        // Need warming if:
        // 1. Never warmed
        // 2. Last warmed > 24 hours ago
        // 3. Low activity score
        return !state.warmed || hoursSinceWarming > 24 || (state.activityScore || 0) < 50;
    }

    // ✅ ACCOUNT WARMING ROUTINE
    async warmAccount(opts = {}) {
        logger.info("═".repeat(60));
        logger.info("[WARMING] 🔥 Starting Account Warming Routine");
        logger.info("═".repeat(60));

        const accountId = opts.accountId || 'default';
        const userDataDir = path.join(process.cwd(), "puppeteer_data");

        let browser;
        try {
            if (opts.browserPath) {
                opts.browserPath = opts.browserPath.trim().replace(/^["'](.+)["']$/, '$1');
                if (!fs.existsSync(opts.browserPath)) {
                    throw new Error(`Browser executable not found: ${opts.browserPath}`);
                }
            }

            browser = await puppeteer.launch({
                executablePath: opts.browserPath || undefined,
                headless: opts.headless !== false,
                args: this.getStealthArgs(),
                userDataDir,
                ignoreDefaultArgs: ["--enable-automation"],
                defaultViewport: null
            });

            const page = await browser.newPage();
            await this.addExtraStealth(page);
            // await page.setViewport({ width: 1920, height: 1080 });

            // Load cookies
            const cookiePath = path.join(process.cwd(), "data", "youtube_cookies.json");
            if (fs.existsSync(cookiePath)) {
                const cookies = JSON.parse(fs.readFileSync(cookiePath, 'utf-8'));
                if (Array.isArray(cookies) && cookies.length > 0) {
                    for (const cookie of cookies) {
                        try {
                            if (cookie.name && cookie.value) {
                                await page.setCookie({
                                    name: cookie.name,
                                    value: cookie.value,
                                    domain: cookie.domain || '.youtube.com',
                                    path: cookie.path || '/',
                                    expires: cookie.expires || Date.now() / 1000 + 86400 * 365,
                                    httpOnly: cookie.httpOnly || false,
                                    secure: cookie.secure || false,
                                    sameSite: cookie.sameSite || 'Lax'
                                });
                            }
                        } catch (e) { }
                    }
                    logger.info("[WARMING] ✅ Cookies loaded");
                }
            }

            let activityScore = 0;

            // ✅ STEP 1: Visit YouTube Homepage
            logger.info("[WARMING] 📱 Step 1/5: Visiting YouTube homepage...");
            await page.goto("https://www.youtube.com", { waitUntil: "networkidle2", timeout: 60000 });
            await new Promise(r => setTimeout(r, 3000 + Math.random() * 3000));
            activityScore += 10;
            logger.info("[WARMING] ✅ Homepage visited (+10 score)");

            // ✅ STEP 2: Search for trending topic
            logger.info("[WARMING] 🔍 Step 2/5: Searching trending videos...");
            const searchTerms = [
                "musik", "berita", "game", "politik", "jokowi",
                "lucu", "prabowo", "liga 1"
            ];
            const randomSearch = searchTerms[Math.floor(Math.random() * searchTerms.length)];

            try {
                // Try multiple search box selectors
                const searchSelectors = [
                    'input#search',
                    'input[name="search_query"]',
                    'input[placeholder*="Search"]',
                    'ytd-searchbox input'
                ];

                let searchBox = null;
                for (const sel of searchSelectors) {
                    try {
                        searchBox = await page.waitForSelector(sel, { timeout: 5000, visible: true });
                        log.info("searchBox: ", searchBox)
                        if (searchBox) {
                            logger.info(`[WARMING] Found search box: ${sel}`);
                            break;
                        }
                    } catch (e) {
                        continue;
                    }
                }

                if (!searchBox) {
                    logger.warn("[WARMING] ⚠️ Could not find search box, skipping search step");
                } else {
                    await searchBox.click();
                    await new Promise(r => setTimeout(r, 500));
                    await page.keyboard.type(randomSearch, { delay: 100 + Math.random() * 100 });
                    await new Promise(r => setTimeout(r, 1000 + Math.random() * 1000));
                    await page.keyboard.press('Enter');

                    try {
                        // Wait for either navigation or results to appear
                        await Promise.race([
                            page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }),
                            page.waitForSelector('ytd-video-renderer', { timeout: 20000 })
                        ]);
                        activityScore += 15;
                        logger.info(`[WARMING] ✅ Searched for "${randomSearch}" (+15 score)`);
                    } catch (e) {
                        // Give extra time for slow connections
                        logger.warn("[WARMING] ⚠️ Search slow, waiting extra time...");
                        await new Promise(r => setTimeout(r, 5000));
                        activityScore += 10; // Partial credit
                        logger.info("[WARMING] ✅ Search completed (partial +10 score)");
                    }

                    // Extra wait for page to fully load
                    await new Promise(r => setTimeout(r, 3000));
                }
            } catch (e) {
                logger.warn(`[WARMING] ⚠️ Search step failed: ${e.message}, continuing...`);
                activityScore += 5; // Minimal credit for trying
            }

            // // ✅ STEP 3: Watch 2-3 videos (at least 30 seconds each)
            // logger.info("[WARMING] 📺 Step 3/5: Watching videos...");
            // const videoCount = 2 + Math.floor(Math.random() * 2); // 2-3 videos

            // for (let i = 0; i < videoCount; i++) {
            //     try {
            //         // Try to find videos on current page
            //         const videoSelectors = [
            //             'a#video-title',
            //             'ytd-video-renderer a#thumbnail',
            //             'ytd-rich-item-renderer a#thumbnail'
            //         ];

            //         let videoLinks = [];
            //         for (const sel of videoSelectors) {
            //             videoLinks = await page.$(sel);
            //             if (videoLinks.length > 0) break;
            //         }

            //         if (videoLinks.length === 0) {
            //             logger.warn(`[WARMING] ⚠️ No videos found for watching, skipping video ${i + 1}`);
            //             continue;
            //         }

            //         const randomIndex = Math.floor(Math.random() * Math.min(5, videoLinks.length));
            //         await videoLinks[randomIndex].click();

            //         try {
            //             await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 });
            //         } catch (e) {
            //             logger.warn("[WARMING] ⚠️ Navigation slow, but continuing...");
            //         }

            //         // Wait for page to settle
            //         await new Promise(r => setTimeout(r, 2000));

            //         // Try to play video
            //         try {
            //             await page.evaluate(() => {
            //                 const video = document.querySelector('video');
            //                 if (video && video.paused) video.play();
            //             });
            //         } catch (e) {
            //             logger.warn("[WARMING] ⚠️ Could not play video, but counting as watched");
            //         }

            //         // Watch for 30-60 seconds
            //         const watchTime = 30000 + Math.floor(Math.random() * 30000);
            //         logger.info(`[WARMING] ⏱️ Watching video ${i + 1}/${videoCount} for ${Math.round(watchTime / 1000)}s...`);
            //         await new Promise(r => setTimeout(r, watchTime));

            //         // Random scroll
            //         await page.evaluate(() => window.scrollBy(0, 200 + Math.random() * 300));
            //         await new Promise(r => setTimeout(r, 1000));

            //         activityScore += 20;
            //         logger.info(`[WARMING] ✅ Video ${i + 1} watched (+20 score)`);

            //         // Go back or navigate home for next video
            //         if (i < videoCount - 1) {
            //             try {
            //                 await page.goto("https://www.youtube.com", { waitUntil: "networkidle2", timeout: 30000 });
            //                 await new Promise(r => setTimeout(r, 2000));
            //             } catch (e) {
            //                 logger.warn("[WARMING] ⚠️ Could not navigate home, stopping video watching");
            //                 break;
            //             }
            //         }
            //     } catch (e) {
            //         logger.warn(`[WARMING] ⚠️ Could not watch video ${i + 1}: ${e.message}`);
            //         activityScore += 10; // Partial credit
            //     }
            // }

            // ========================================
            // PASTE THIS INTO warmAccount() function
            // Replace the entire STEP 3 section
            // ========================================

            // STEP 3: Watch Videos
            logger.info("[WARMING] 📺 Step 3/5: Watching videos...");
            const videoCount = 2;

            for (let i = 0; i < videoCount; i++) {
                try {
                    logger.info(`[WARMING] 🎬 Starting video ${i + 1}/${videoCount}...`);
                    await new Promise(r => setTimeout(r, 3000));

                    // ✅ STRATEGY 1: Click via page.evaluate (most reliable)
                    const clicked = await page.evaluate((index) => {
                        // Find all video renderers
                        const videoElements = Array.from(document.querySelectorAll('ytd-video-renderer'));

                        if (videoElements.length === 0) {
                            console.log('No ytd-video-renderer found');
                            return false;
                        }

                        console.log(`Found ${videoElements.length} video elements`);

                        // Get random video (from first 5)
                        const maxIndex = Math.min(5, videoElements.length);
                        const randomIndex = Math.floor(Math.random() * maxIndex);
                        const videoEl = videoElements[randomIndex];

                        if (!videoEl) {
                            console.log('Video element is null');
                            return false;
                        }

                        // Find clickable link inside (thumbnail or title)
                        const link = videoEl.querySelector('a#thumbnail') ||
                            videoEl.querySelector('a#video-title') ||
                            videoEl.querySelector('a[href*="/watch?v="]');

                        if (!link) {
                            console.log('No clickable link found in video element');
                            return false;
                        }

                        console.log('Clicking video link:', link.href);
                        link.click();
                        return true;
                    }, i);

                    if (!clicked) {
                        logger.error(`[WARMING] ❌ Could not click video ${i + 1} via evaluate`);

                        // ✅ FALLBACK: Try extracting video IDs
                        logger.warn(`[WARMING] ⚠️ Trying fallback: extract video IDs...`);

                        const videoIds = await page.evaluate(() => {
                            const links = Array.from(document.querySelectorAll('a[href*="/watch?v="]'));
                            const ids = links
                                .map(a => {
                                    const match = a.href.match(/\/watch\?v=([^&]+)/);
                                    return match ? match[1] : null;
                                })
                                .filter(id => id && id.length === 11);
                            return [...new Set(ids)];
                        });

                        if (videoIds && videoIds.length > 0) {
                            logger.info(`[WARMING]   ✅ Found ${videoIds.length} video IDs via fallback`);
                            const randomVideoId = videoIds[Math.floor(Math.random() * Math.min(5, videoIds.length))];
                            const videoUrl = `https://www.youtube.com/watch?v=${randomVideoId}`;

                            logger.info(`[WARMING]   🎯 Navigating directly to: ${randomVideoId}`);
                            await page.goto(videoUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
                        } else {
                            logger.error(`[WARMING] ❌ No video IDs found either, skipping video ${i + 1}`);
                            continue;
                        }
                    } else {
                        logger.info(`[WARMING]   ✅ Video clicked successfully`);
                    }

                    // Wait for video page to load
                    try {
                        await Promise.race([
                            page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 20000 }),
                            page.waitForSelector('video', { timeout: 20000 })
                        ]);
                        logger.info(`[WARMING]   ✅ Video page loaded`);
                    } catch (e) {
                        logger.warn(`[WARMING]   ⚠️ Page load slow: ${e.message}`);
                    }

                    await new Promise(r => setTimeout(r, 3000));

                    // Try to play video
                    try {
                        const videoPlayed = await page.evaluate(() => {
                            const video = document.querySelector('video');
                            if (video) {
                                if (video.paused) video.play();
                                return true;
                            }
                            return false;
                        });
                        if (videoPlayed) {
                            logger.info("[WARMING]   ▶️ Video playing");
                        } else {
                            logger.warn("[WARMING]   ⚠️ Video element not found, but continuing...");
                        }
                    } catch (e) {
                        logger.warn(`[WARMING]   ⚠️ Could not play video: ${e.message}`);
                    }

                    // Watch for 30-60 seconds
                    const watchTime = 30000 + Math.floor(Math.random() * 30000);
                    const watchSeconds = Math.round(watchTime / 1000);
                    logger.info(`[WARMING]   ⏱️ Watching video ${i + 1}/${videoCount} for ${watchSeconds}s...`);

                    // Show countdown every 10 seconds
                    const startTime = Date.now();
                    while (Date.now() - startTime < watchTime) {
                        await new Promise(r => setTimeout(r, 10000));
                        const elapsed = Math.round((Date.now() - startTime) / 1000);
                        const remaining = watchSeconds - elapsed;
                        if (remaining > 0) {
                            logger.info(`[WARMING]     ⏳ Still watching... ${remaining}s remaining`);
                        }
                    }

                    // Random scroll
                    await page.evaluate(() => window.scrollBy(0, 200 + Math.random() * 300));
                    await new Promise(r => setTimeout(r, 1000));

                    activityScore += 20;
                    logger.info(`[WARMING]   ✅ Video ${i + 1} watched successfully (+20 score)`);

                    // Go home for next video
                    if (i < videoCount - 1) {
                        try {
                            logger.info(`[WARMING]   🏠 Returning to homepage for next video...`);
                            await page.goto("https://www.youtube.com", {
                                waitUntil: "domcontentloaded",
                                timeout: 30000
                            });
                            await new Promise(r => setTimeout(r, 3000));
                        } catch (e) {
                            logger.error(`[WARMING] ❌ Could not navigate home: ${e.message}`);
                            logger.warn("[WARMING] ⚠️ Stopping video watching loop");
                            break;
                        }
                    }
                } catch (e) {
                    logger.error(`[WARMING] ❌ Video ${i + 1} failed: ${e.message}`);
                    logger.error(`[WARMING] Stack: ${e.stack}`);
                    activityScore += 10; // Partial credit
                }
            }
            // ✅ STEP 4: Like 1-2 videos
            logger.info("[WARMING] 👍 Step 4/5: Liking videos...");
            const likesToGive = 1 + Math.floor(Math.random() * 2); // 1-2 likes

            for (let i = 0; i < likesToGive; i++) {
                try {
                    // Try multiple like button selectors
                    const likeSelectors = [
                        'like-button-view-model button[aria-label*="like"]',
                        'button[aria-label*="like this video"]',
                        '#like-button button',
                        'ytd-toggle-button-renderer[aria-label*="like"] button'
                    ];

                    let likeBtn = null;
                    for (const sel of likeSelectors) {
                        try {
                            likeBtn = await page.$(sel);
                            if (likeBtn) break;
                        } catch (e) {
                            continue;
                        }
                    }

                    if (likeBtn) {
                        const isAlreadyLiked = await page.evaluate(btn => {
                            return btn.getAttribute('aria-pressed') === 'true';
                        }, likeBtn);

                        if (!isAlreadyLiked) {
                            await likeBtn.click();
                            await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));
                            activityScore += 15;
                            logger.info(`[WARMING] ✅ Liked video ${i + 1} (+15 score)`);
                        } else {
                            logger.info(`[WARMING] ℹ️ Video already liked, skipping`);
                        }
                    } else {
                        logger.warn(`[WARMING] ⚠️ Could not find like button`);
                    }

                    // Navigate to another video if we need more likes
                    if (i < likesToGive - 1) {
                        try {
                            await page.goto("https://www.youtube.com", { waitUntil: "networkidle2", timeout: 30000 });
                            await new Promise(r => setTimeout(r, 2000));

                            const homeVideoSelectors = [
                                'a#video-title',
                                'ytd-rich-item-renderer a#thumbnail'
                            ];

                            let homeVideos = [];
                            for (const sel of homeVideoSelectors) {
                                homeVideos = await page.$(sel);
                                if (homeVideos.length > 0) break;
                            }

                            if (homeVideos.length > 0) {
                                const randomVideo = homeVideos[Math.floor(Math.random() * Math.min(10, homeVideos.length))];
                                await randomVideo.click();
                                await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => { });
                                await new Promise(r => setTimeout(r, 2000));
                            }
                        } catch (e) {
                            logger.warn(`[WARMING] ⚠️ Could not navigate to next video for liking`);
                            break;
                        }
                    }
                } catch (e) {
                    logger.warn(`[WARMING] ⚠️ Could not like video ${i + 1}: ${e.message}`);
                }
            }

            // ✅ STEP 5: Subscribe to 1 channel (optional, 40% chance)
            if (Math.random() > 0.6) {
                logger.info("[WARMING] 📌 Step 5/5: Subscribing to channel...");
                try {
                    // Try multiple subscribe button selectors
                    const subSelectors = [
                        'button[aria-label*="Subscribe"]',
                        'ytd-subscribe-button-renderer button',
                        '#subscribe-button button'
                    ];

                    let subBtn = null;
                    for (const sel of subSelectors) {
                        try {
                            subBtn = await page.$(sel);
                            if (subBtn) break;
                        } catch (e) {
                            continue;
                        }
                    }

                    if (subBtn) {
                        const isSubscribed = await page.evaluate(btn => {
                            const text = btn.textContent.toLowerCase();
                            return text.includes('subscribed') || text.includes('unsubscribe');
                        }, subBtn);

                        if (!isSubscribed) {
                            await subBtn.click();
                            await new Promise(r => setTimeout(r, 1000));
                            activityScore += 25;
                            logger.info("[WARMING] ✅ Subscribed to channel (+25 score)");
                        } else {
                            logger.info("[WARMING] ℹ️ Already subscribed to this channel");
                        }
                    } else {
                        logger.warn("[WARMING] ⚠️ Could not find subscribe button");
                    }
                } catch (e) {
                    logger.warn(`[WARMING] ⚠️ Could not subscribe to channel: ${e.message}`);
                }
            } else {
                logger.info("[WARMING] ⏭️ Step 5/5: Skipping subscription (random choice)");
            }

            // ✅ SAVE WARMING STATE
            this.warmingState[accountId] = {
                warmed: true,
                lastWarmed: Date.now(),
                activityScore: activityScore,
                videosWatched: videoCount,
                likesGiven: likesToGive
            };
            this.saveWarmingState();

            logger.info("═".repeat(60));
            logger.info(`[WARMING] 🎉 Account Warming Complete!`);
            logger.info(`[WARMING] 📊 Final Activity Score: ${activityScore}/100`);
            logger.info(`[WARMING] ✅ Account is now warmed and ready for commenting!`);
            logger.info("═".repeat(60));

            return {
                success: true,
                activityScore: activityScore,
                message: `Account warmed successfully! Score: ${activityScore}/100`
            };

        } catch (e) {
            logger.error(`[WARMING] ❌ Error during warming: ${e.message}`);
            return {
                success: false,
                message: e.message
            };
        } finally {
            if (browser) await browser.close();
        }
    }

    getStealthArgs() {
        return [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-blink-features=AutomationControlled",
            "--disable-dev-shm-usage",
            "--disable-accelerated-2d-canvas",
            "--no-first-run",
            "--no-zygote",
            "--disable-gpu",
            "--hide-scrollbars",
            "--mute-audio",
            "--disable-background-timer-throttling",
            "--disable-backgrounding-occluded-windows",
            "--disable-breakpad",
            "--disable-component-extensions-with-background-pages",
            "--disable-features=TranslateUI,BlinkGenPropertyTrees,IsolateOrigins,site-per-process",
            "--disable-ipc-flooding-protection",
            "--disable-renderer-backgrounding",
            "--enable-features=NetworkService,NetworkServiceInProcess",
            "--force-color-profile=srgb",
            "--metrics-recording-only",
            "--no-default-browser-check",
            "--window-size=1920,1080",
            "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
        ];
    }

    async addExtraStealth(page) {
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => false,
            });

            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5],
            });

            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-US', 'en'],
            });

            window.chrome = {
                runtime: {},
            };

            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters) => (
                parameters.name === 'notifications' ?
                    Promise.resolve({ state: Notification.permission }) :
                    originalQuery(parameters)
            );
        });
    }

    async post(videoId, text, opts = {}) {
        // ✅ CHECK IF WARMING IS NEEDED
        const accountId = opts.accountId || 'default';
        if (opts.autoWarm !== false && this.needsWarming(accountId)) {
            logger.info("[WebEngine] 🔥 Account needs warming before posting!");
            logger.info("[WebEngine] Starting auto-warming routine...");
            const warmResult = await this.warmAccount(opts);
            if (!warmResult.success) {
                logger.warn("[WebEngine] ⚠️ Warming failed, but will proceed with posting...");
            }
        }

        logger.info(`[WebEngine] Starting web post for ${videoId} with ULTRA STEALTH Mode`);

        const userDataDir = path.join(process.cwd(), "puppeteer_data");
        const logsDir = path.join(process.cwd(), "logs");
        if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

        let browser;
        try {
            if (opts.browserPath) {
                opts.browserPath = opts.browserPath.trim().replace(/^["'](.+)["']$/, '$1');
                if (!fs.existsSync(opts.browserPath)) {
                    throw new Error(`Browser executable not found at: ${opts.browserPath}`);
                }
            }

            browser = await puppeteer.launch({
                executablePath: opts.browserPath || undefined,
                headless: opts.headless !== false,
                args: this.getStealthArgs(),
                userDataDir,
                ignoreDefaultArgs: ["--enable-automation"],
                defaultViewport: null
            });

            const page = await browser.newPage();
            await this.addExtraStealth(page);
            await page.setViewport({ width: 1920, height: 1080 });

            // Load cookies
            const cookiePath = path.join(process.cwd(), "data", "youtube_cookies.json");
            let cookiesLoaded = false;

            if (fs.existsSync(cookiePath)) {
                try {
                    const cookieData = fs.readFileSync(cookiePath, 'utf-8');
                    const cookies = JSON.parse(cookieData);

                    if (Array.isArray(cookies) && cookies.length > 0) {
                        for (const cookie of cookies) {
                            try {
                                if (cookie.name && cookie.value) {
                                    await page.setCookie({
                                        name: cookie.name,
                                        value: cookie.value,
                                        domain: cookie.domain || '.youtube.com',
                                        path: cookie.path || '/',
                                        expires: cookie.expires || Date.now() / 1000 + 86400 * 365,
                                        httpOnly: cookie.httpOnly || false,
                                        secure: cookie.secure || false,
                                        sameSite: cookie.sameSite || 'Lax'
                                    });
                                }
                            } catch (e) { }
                        }

                        cookiesLoaded = true;
                        logger.info(`[WebEngine] ✅ Loaded ${cookies.length} cookies`);
                    }
                } catch (e) {
                    logger.error(`[WebEngine] ❌ Failed to parse cookies: ${e.message}`);
                }
            }

            if (!cookiesLoaded) {
                logger.warn("═".repeat(60));
                logger.warn("[WebEngine] 🚨 NO VALID SESSION FOUND");
                logger.warn("[WebEngine] Please setup login first!");
                logger.warn("═".repeat(60));
            }

            const url = `https://www.youtube.com/watch?v=${videoId}`;
            logger.info(`[WebEngine] Navigating to ${url}`);

            await page.goto(url, {
                waitUntil: "networkidle2",
                timeout: 90000
            });

            const currentUrl = page.url();
            if (currentUrl.includes('accounts.google.com') || currentUrl.includes('signin')) {
                const ss = path.join(logsDir, `login_required_${videoId}.png`);
                await page.screenshot({ path: ss, fullPage: true });
                throw new Error("❌ NOT LOGGED IN: Please setup login first!");
            }

            // ✅ MINI PRE-COMMENT WARMING
            logger.info("[WebEngine] 🎭 Pre-comment activity...");

            await new Promise(r => setTimeout(r, 3000 + Math.random() * 4000));

            try {
                await page.evaluate(() => {
                    const video = document.querySelector('video');
                    if (video && video.paused) video.play();
                });
                logger.info("[WebEngine] ▶️ Video played");
                await new Promise(r => setTimeout(r, 5000 + Math.random() * 5000));
            } catch (e) { }

            // Like video (30% chance)
            if (Math.random() > 0.7) {
                try {
                    const likeBtn = await page.$('like-button-view-model button[aria-label*="like"]');
                    if (likeBtn) {
                        await likeBtn.click();
                        logger.info("[WebEngine] 👍 Liked video");
                        await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));
                    }
                } catch (e) { }
            }

            // Scrape metadata
            let scrapedMetadata = null;
            try {
                scrapedMetadata = await page.evaluate(() => {
                    const titleEl = document.querySelector("h1.ytd-watch-metadata") ||
                        document.querySelector("#title h1");
                    const descEl = document.querySelector("#description-inline-expander") ||
                        document.querySelector("#description");

                    return {
                        title: titleEl ? titleEl.textContent.trim() : "",
                        description: descEl ? descEl.textContent.trim() : ""
                    };
                });
                logger.info(`[WebEngine] Scraped: ${scrapedMetadata.title.substring(0, 40)}...`);
            } catch (e) {
                logger.warn(`[WebEngine] Metadata scraping failed`);
            }

            if (opts.aiCallback && scrapedMetadata && scrapedMetadata.title) {
                try {
                    const aiText = await opts.aiCallback(scrapedMetadata);
                    if (aiText) text = aiText;
                } catch (e) { }
            }

            // Scroll to comments
            logger.info("[WebEngine] 📜 Scrolling to comments section...");

            // Strategy 1: Scroll gradually
            for (let i = 0; i < 8; i++) {
                const scrollAmount = 400 + Math.floor(Math.random() * 300);
                await page.evaluate((amt) => window.scrollBy(0, amt), scrollAmount);
                await new Promise(r => setTimeout(r, 800 + Math.random() * 1000));
            }

            // Strategy 2: Wait for comments container
            try {
                await page.waitForSelector("#comments", { timeout: 10000 });
                logger.info("[WebEngine] ✅ Comments section found");
            } catch (e) {
                logger.warn("[WebEngine] ⚠️ Comments section not visible, scrolling more...");
                await page.evaluate(() => window.scrollBy(0, 1500));
                await new Promise(r => setTimeout(r, 3000));
            }

            // Strategy 3: Force scroll to comments (JavaScript)
            try {
                await page.evaluate(() => {
                    const commentsSection = document.querySelector('#comments');
                    if (commentsSection) {
                        commentsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                });
                await new Promise(r => setTimeout(r, 2000));
            } catch (e) {
                logger.warn("[WebEngine] Could not force scroll to comments");
            }

            // Additional wait for lazy loading
            await new Promise(r => setTimeout(r, 3000));

            // Find and type in comment box
            logger.info("[WebEngine] 🔍 Finding comment input box...");

            const inputSelectors = [
                "#contenteditable-root",
                "div#contenteditable-root[contenteditable='true']",
                "[aria-label='Add a comment...']",
                "ytd-comment-simplebox-renderer #contenteditable-root",
                "#simplebox-placeholder",
                "div[id='contenteditable-root'][role='textbox']"
            ];

            let inputElement = null;
            let usedSelector = "";

            // Try each selector with longer timeout
            for (const sel of inputSelectors) {
                try {
                    logger.info(`[WebEngine] Trying selector: ${sel}`);
                    inputElement = await page.waitForSelector(sel, { timeout: 5000, visible: true });
                    if (inputElement) {
                        usedSelector = sel;
                        logger.info(`[WebEngine] ✅ Found input element via: ${sel}`);
                        break;
                    }
                } catch (e) {
                    logger.warn(`[WebEngine] Selector failed: ${sel}`);
                    continue;
                }
            }

            if (!inputElement) {
                // Last resort: Try clicking the placeholder to activate input
                logger.warn("[WebEngine] Input not found, trying to click placeholder...");
                try {
                    const placeholder = await page.$('#placeholder-area');
                    if (placeholder) {
                        await placeholder.click();
                        await new Promise(r => setTimeout(r, 2000));

                        // Retry finding input after click
                        for (const sel of inputSelectors) {
                            inputElement = await page.$(sel);
                            if (inputElement) {
                                usedSelector = sel;
                                logger.info(`[WebEngine] ✅ Found input after placeholder click: ${sel}`);
                                break;
                            }
                        }
                    }
                } catch (e) {
                    logger.error("[WebEngine] Could not click placeholder");
                }
            }

            if (!inputElement) {
                const ss = path.join(logsDir, `fail_input_box_${videoId}.png`);
                await page.screenshot({ path: ss, fullPage: true });
                logger.error(`[WebEngine] Screenshot saved to: ${ss}`);
                throw new Error("Could not find comment input box");
            }

            logger.info("[WebEngine] ⌨️ Typing comment...");
            await inputElement.focus();
            await new Promise(r => setTimeout(r, 500));

            // Clear any existing text
            await page.evaluate((el) => { if (el) el.textContent = ""; }, inputElement);
            await new Promise(r => setTimeout(r, 300));

            // Type comment with human-like delays
            for (const char of text) {
                if (char === "\n") {
                    await page.keyboard.press("Enter");
                } else if (char !== "\r") {
                    await page.keyboard.sendCharacter(char);
                }
                await new Promise(r => setTimeout(r, Math.floor(Math.random() * 200 + 100)));

                if (Math.random() > 0.96) {
                    await new Promise(r => setTimeout(r, 800 + Math.random() * 1500));
                }
            }

            logger.info("[WebEngine] ✅ Comment typed successfully");
            await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));

            // Submit
            logger.info("[WebEngine] Submitting...");
            const submitBtnSelectors = [
                "ytd-button-renderer#submit-button",
                "#submit-button button[aria-label='Comment']"
            ];

            let submitted = false;
            for (const sel of submitBtnSelectors) {
                try {
                    const btn = await page.$(sel);
                    if (btn) {
                        const isEnabled = await page.evaluate(el => {
                            const b = el.querySelector('button') || el;
                            return b && !b.hasAttribute('disabled');
                        }, btn);

                        if (isEnabled) {
                            await btn.click();
                            submitted = true;
                            break;
                        }
                    }
                } catch (e) { continue; }
            }

            if (!submitted) {
                throw new Error("Could not submit comment");
            }

            await new Promise(r => setTimeout(r, 10000));

            // Verify
            const commentAppeared = await page.evaluate((txt) => {
                const comments = Array.from(document.querySelectorAll("#content-text"));
                return comments.some(c => c.textContent.includes(txt.trim()));
            }, text);

            if (!commentAppeared) {
                logger.warn("[WebEngine] ⚠️ Shadow ban detected");
                return {
                    status: "success",
                    moderationStatus: "held_for_review",
                    engine: "web"
                };
            }

            logger.info("[WebEngine] ✅ Comment verified!");
            return {
                status: "success",
                moderationStatus: "published",
                engine: "web"
            };

        } catch (e) {
            logger.error(`[WebEngine] Error: ${e.message}`);
            return { status: "error", message: e.message, engine: "web" };
        } finally {
            if (browser) await browser.close();
        }
    }

    async setupLogin(browserPath) {
        logger.info(`[WebEngine] Opening STEALTH browser for setup`);
        const userDataDir = path.join(process.cwd(), "puppeteer_data");
        if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });

        if (browserPath) {
            browserPath = browserPath.trim().replace(/^["'](.+)["']$/, '$1');
            if (!fs.existsSync(browserPath)) {
                throw new Error(`Browser NOT FOUND: ${browserPath}`);
            }
        }

        let browser;
        try {
            browser = await puppeteer.launch({
                executablePath: browserPath || undefined,
                headless: false,
                args: this.getStealthArgs(),
                userDataDir,
                ignoreDefaultArgs: ["--enable-automation"],
                defaultViewport: null
            });
            logger.info("[WebEngine] ✅ Stealth browser opened");
        } catch (e) {
            throw new Error(`Failed to launch: ${e.message}`);
        }

        try {
            const page = await browser.newPage();
            await this.addExtraStealth(page);
            await page.setViewport({ width: 1920, height: 1080 });

            await page.goto("https://www.youtube.com", {
                waitUntil: "networkidle2",
                timeout: 60000
            });

            const dataDir = path.join(process.cwd(), "data");
            if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

            const cookiePath = path.join(dataDir, "youtube_cookies.json");

            let saveCount = 0;

            const saveInterval = setInterval(async () => {
                try {
                    const cookies = await page.cookies();

                    if (cookies && cookies.length > 0) {
                        fs.writeFileSync(cookiePath, JSON.stringify(cookies, null, 2));
                        saveCount++;

                        const hasAuthCookie = cookies.some(c =>
                            ['SID', 'SSID', 'APISID', 'SAPISID', '__Secure-1PSID'].includes(c.name)
                        );

                        if (hasAuthCookie) {
                            logger.info(`[WebEngine] 💾 Saved ${cookies.length} cookies - ✅ LOGIN DETECTED`);
                        } else {
                            logger.info(`[WebEngine] 💾 Saved ${cookies.length} cookies - ⏳ Waiting...`);
                        }
                    }
                } catch (e) { }
            }, 3000);

            logger.info("═".repeat(60));
            logger.info("[WebEngine] 🔐 STEALTH SETUP MODE");
            logger.info("[WebEngine] Login to YouTube and close browser when done");
            logger.info("═".repeat(60));

            return new Promise((resolve) => {
                browser.on("disconnected", () => {
                    clearInterval(saveInterval);
                    resolve({ ok: true });
                });
            });
        } catch (e) {
            if (browser) await browser.close();
            throw e;
        }
    }
}

module.exports = new WebEngine();