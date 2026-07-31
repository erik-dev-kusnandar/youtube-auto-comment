require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ACCOUNT = process.env.ACCOUNT_NAME || "default";
const SOURCE =
    process.env.CHROME_SOURCE ||
    path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "User Data");
const DEST = path.join(process.cwd(), "puppeteer_data", ACCOUNT);

const FORCE_KILL = process.argv.includes("--force") || process.env.FORCE_KILL === "1";
const delay = ms => new Promise(r => setTimeout(r, ms));

// Heavy/volatile dirs that Chrome rebuilds automatically — skip only pure caches.
const EXCLUDE_DIRS = [
    "Cache",
    "Code Cache",
    "GPUCache",
    "GrShaderCache",
    "DawnGraphiteCache",
    "DawnWebGPUCache",
    "DawnCache",
    "ShaderCache",
    "GraphiteDawnCache",
    "Cached Data",
    "Dictionaries"
];

function copyLockedFileSync(src, dest) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    // Use powershell to copy file with FileShare.ReadWrite sharing flags on Windows
    try {
        const psCommand = `[System.IO.File]::Open('${src}', [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite).CopyTo([System.IO.File]::Create('${dest}'))`;
        execSync(`powershell -Command "${psCommand.replace(/"/g, '\\"')}"`, { stdio: "ignore" });
        if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
            return true;
        }
    } catch (_) {}

    // Fallback to standard Node.js logic if somehow powershell fails
    let fIn = null;
    let fOut = null;
    try {
        fIn = fs.openSync(src, 'r', 0o666);
        fOut = fs.openSync(dest, 'w', 0o666);
        const buf = Buffer.alloc(65536);
        let bytesRead = 0;
        do {
            bytesRead = fs.readSync(fIn, buf, 0, 65536, null);
            if (bytesRead > 0) {
                fs.writeSync(fOut, buf, 0, bytesRead);
            }
        } while (bytesRead > 0);
        return true;
    } catch (_) {
        return false;
    } finally {
        if (fIn !== null) { try { fs.closeSync(fIn); } catch (_) {} }
        if (fOut !== null) { try { fs.closeSync(fOut); } catch (_) {} }
    }
}

function copyDirSync(src, dest, excludeDirs = []) {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        if (excludeDirs.includes(entry.name)) continue;
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDirSync(srcPath, destPath, excludeDirs);
        } else {
            if (!copyLockedFileSync(srcPath, destPath)) {
                // Fallback to standard copy if somehow it behaves differently
                try {
                    fs.copyFileSync(srcPath, destPath);
                } catch (_) {}
            }
        }
    }
}

async function copyProfile() {
    if (!fs.existsSync(SOURCE)) {
        return {
            ok: false,
            message: `Chrome profile not found: ${SOURCE}. Set CHROME_SOURCE in .env if Chrome is elsewhere.`
        };
    }

    if (FORCE_KILL) {
        console.log("[copy-profile] --force: closing all chrome.exe...");
        try {
            execSync("taskkill /IM chrome.exe /F", { stdio: "inherit" });
        } catch (e) {
            console.warn("[copy-profile] No chrome.exe to kill (or not running).");
        }
        await delay(1500);
    }

    fs.mkdirSync(DEST, { recursive: true });

    // Copy the essential pieces: Default profile + Local State.
    // Locked files (Cookies, Local State when Chrome is running) are skipped gracefully.
    for (const item of ["Default", "Local State"]) {
        const srcPath = path.join(SOURCE, item);
        const destPath = path.join(DEST, item);
        if (!fs.existsSync(srcPath)) continue;
        const stat = fs.statSync(srcPath);
        if (stat.isDirectory()) {
            copyDirSync(srcPath, destPath, EXCLUDE_DIRS);
        } else {
            try {
                fs.copyFileSync(srcPath, destPath);
            } catch (_) {
                // Skip locked file
            }
        }
    }

    const localState = path.join(DEST, "Local State");
    const defaultPrefs = path.join(DEST, "Default", "Preferences");
    const cookiesDb = path.join(DEST, "Default", "Network", "Cookies");

    if (!fs.existsSync(localState) && !fs.existsSync(defaultPrefs)) {
        return { ok: false, message: `Copy looks wrong — no profile found in ${DEST}` };
    }

    const cookieOk = fs.existsSync(cookiesDb);
    return {
        ok: true,
        account: ACCOUNT,
        source: SOURCE,
        target: DEST,
        cookiesCarried: cookieOk,
        message: cookieOk
            ? `Profile copied (account: ${ACCOUNT}). Logged-in session carried over.`
            : `Profile copied but Cookies NOT copied (account: ${ACCOUNT}). ` +
              `Chrome may still be running — close Chrome fully and re-run for the login to carry over.`
    };
}

/**
 * syncProfile(opts) — Copy Chrome profile while Chrome may still be running.
 * Uses robocopy /b (Windows backup mode) to bypass file locks on critical files
 * like Cookies and Login Data that Chrome keeps open exclusively.
 * Writes a `.last_sync` timestamp so webEngine can detect staleness.
 *
 * @param {object} [opts]
 * @param {string}  [opts.account] - Override ACCOUNT_NAME env var
 * @param {string}  [opts.source]  - Override Chrome source path
 * @param {boolean} [opts.silent]  - Suppress console output
 */
async function syncProfile(opts = {}) {
    const account = opts.account || ACCOUNT;
    const source  = opts.source  || SOURCE;
    const dest    = path.join(process.cwd(), "puppeteer_data", account);
    const log  = (...a) => { if (!opts.silent) console.log("[copy-profile]",  ...a); };
    const warn = (...a) => { if (!opts.silent) console.warn("[copy-profile]", ...a); };

    if (!fs.existsSync(source)) {
        return {
            ok: false,
            message: `Chrome profile not found: ${source}. Set CHROME_SOURCE in .env if Chrome is elsewhere.`,
            skippedLocked: false,
            cookiesCarried: false
        };
    }

    fs.mkdirSync(dest, { recursive: true });

    let totalCopied = 0;
    let totalSkipped = 0;

    // --- Standard recursive copy (skips locked files gracefully) ---
    const copyAndCount = (s, d, excl) => {
        fs.mkdirSync(d, { recursive: true });
        let entries;
        try { entries = fs.readdirSync(s, { withFileTypes: true }); }
        catch (_) { return; }
        for (const entry of entries) {
            if (excl.includes(entry.name)) continue;
            const sp = path.join(s, entry.name);
            const dp = path.join(d, entry.name);
            if (entry.isDirectory()) {
                copyAndCount(sp, dp, excl);
            } else {
                if (copyLockedFileSync(sp, dp)) {
                    totalCopied++;
                } else {
                    try {
                        fs.copyFileSync(sp, dp);
                        totalCopied++;
                    } catch (_) {
                        totalSkipped++;
                    }
                }
            }
        }
    };

    for (const item of ["Default", "Local State"]) {
        const srcPath  = path.join(source, item);
        const destPath = path.join(dest, item);
        if (!fs.existsSync(srcPath)) continue;
        if (fs.statSync(srcPath).isDirectory()) {
            copyAndCount(srcPath, destPath, EXCLUDE_DIRS);
        } else {
            if (!copyLockedFileSync(srcPath, destPath)) {
                try { fs.copyFileSync(srcPath, destPath); } catch (_) {}
            }
            totalCopied++;
        }
    }

    // Ensure zero-byte corrupt destination files are cleaned up if copy failed
    const cleanZeroByteFiles = (dir) => {
        if (!fs.existsSync(dir)) return;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) {
                cleanZeroByteFiles(p);
            } else if (e.isFile() && fs.statSync(p).size === 0) {
                try { fs.unlinkSync(p); } catch (_) {}
            }
        }
    };

    // --- Critical locked auth files copy ---
    const criticalFiles = [
        { srcDir: path.join(source, "Default", "Network"), destDir: path.join(dest, "Default", "Network"), file: "Cookies" },
        { srcDir: path.join(source, "Default", "Network"), destDir: path.join(dest, "Default", "Network"), file: "Cookies-journal" },
        { srcDir: path.join(source, "Default"),            destDir: path.join(dest, "Default"),            file: "Login Data" },
        { srcDir: path.join(source, "Default"),            destDir: path.join(dest, "Default"),            file: "Login Data For Account" },
        { srcDir: source,                                   destDir: dest,                                   file: "Local State" },
    ];

    let copiedCookiesOk = false;
    const cookiesDestPath = path.join(dest, "Default", "Network", "Cookies");

    // Check if Cookies already copied with valid size
    if (fs.existsSync(cookiesDestPath) && fs.statSync(cookiesDestPath).size > 1000) {
        copiedCookiesOk = true;
    }

    if (!copiedCookiesOk) {
        log("Attempting locked sync of auth session & Cookies using stream copy...");
        // Retry copying critical auth files with copyLockedFileSync
        for (const { srcDir, destDir, file } of criticalFiles) {
            const sp = path.join(srcDir, file);
            const dp = path.join(destDir, file);
            if (!fs.existsSync(sp)) continue;
            fs.mkdirSync(destDir, { recursive: true });
            try {
                if (fs.existsSync(dp)) fs.unlinkSync(dp);
                if (copyLockedFileSync(sp, dp)) {
                    log(`  Successfully copied locked auth file: ${file} (${fs.statSync(dp).size} bytes)`);
                } else {
                    fs.copyFileSync(sp, dp);
                    log(`  Copied auth file via fallback: ${file}`);
                }
            } catch (e) {
                warn(`  Could not copy ${file}: ${e.message}`);
            }
        }
    }

    cleanZeroByteFiles(dest);

    const localState   = path.join(dest, "Local State");
    const defaultPrefs = path.join(dest, "Default", "Preferences");

    if (!fs.existsSync(localState) && !fs.existsSync(defaultPrefs)) {
        return {
            ok: false,
            message: `Sync looks wrong — no profile written to ${dest}`,
            skippedLocked: false,
            cookiesCarried: false
        };
    }

    // Write epoch timestamp so webEngine._needsSync() can compare quickly
    fs.writeFileSync(path.join(dest, ".last_sync"), String(Date.now()));

    const cookieFileExists = fs.existsSync(cookiesDestPath);
    const cookieSize = cookieFileExists ? fs.statSync(cookiesDestPath).size : 0;
    const cookiesCarried = cookieSize > 1000;

    log(`Synced ${totalCopied} files → ${dest}`);
    log(`Cookies file size in profile: ${cookieSize} bytes (Carried: ${cookiesCarried})`);

    return {
        ok: true,
        account,
        source,
        target: dest,
        cookiesCarried,
        skippedLocked: !cookiesCarried,
        lastSync: new Date().toISOString(),
        message: cookiesCarried
            ? `Profile synced (account: ${account}). Logged-in session carried over (${Math.round(cookieSize/1024)} KB cookies).`
            : `Profile synced but Cookies file is empty. Close Chrome completely and re-run Sync.`
    };
}

module.exports = { copyProfile, syncProfile, ACCOUNT, SOURCE, DEST };

if (require.main === module) {
    syncProfile().then(result => {
        if (result.ok) {
            console.log(`[copy-profile] Done. Profile ready for webEngine.`);
            console.log(`[copy-profile] Account: ${result.account}`);
            console.log(`[copy-profile] Target: ${result.target}`);
            console.log(`[copy-profile] Last Sync: ${result.lastSync}`);
            if (!result.cookiesCarried) {
                console.warn("[copy-profile] WARNING: Cookies locked/skipped (Chrome running?). Close Chrome and re-run for full login.");
            } else {
                console.log("[copy-profile] Cookies found — logged-in session carried over.");
            }
        } else {
            console.error(`[copy-profile] ${result.message}`);
            process.exit(1);
        }
    }).catch(e => {
        console.error("[copy-profile] Unexpected error:", e.message);
        process.exit(1);
    });
}
