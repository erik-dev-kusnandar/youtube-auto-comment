require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");
const logger = require("./logger");
const { pickSmartComments } = require("./utils");

const TOKEN_PATH = path.join(__dirname, "../data/tokens.json");
// const selected = pickSmartComments(store.comments, commentsPerVideo);

function loadRefreshToken() {
  const data = JSON.parse(fs.readFileSync(TOKEN_PATH));
  return data.accounts.default.refresh_token;
}

function createClient() {
  const client = new google.auth.OAuth2(
    process.env.CLIENT_ID,
    process.env.CLIENT_SECRET,
    `${process.env.BASE_URL}/oauth2callback`
  );

  client.setCredentials({
    refresh_token: loadRefreshToken(),
  });

  return client;
}

async function postComment(videoId, text) {
  try {
    const auth = createClient();
    const yt = google.youtube({ version: "v3", auth });

    const result = await yt.commentThreads.insert({
      part: ["snippet"],
      requestBody: {
        snippet: {
          videoId,
          topLevelComment: {
            snippet: { textOriginal: text },
          },
        },
      },
    });

    logger.info(`Comment posted → ${result.data.id}`);
    return result.data;
    } catch (error) {
    const msg = error?.errors?.[0]?.message || error.message || "Unknown error";
    logger.error("Failed to post comment: " + msg);
    throw new Error(msg);
  }
}

// ===============================
//  WORKER: AUTO COMMENT SYSTEM
// ===============================
function startWorker({ videos, comments, perVideo, delayMin, delayMax, hourlyLimit }) {
  console.log("[worker] Starting auto-comment worker...");

  // ================================
  // NORMALISASI AGAR ALWAYS ARRAY
  // ================================
  let videoList = [];

  // Jika videos adalah OBJECT → ubah ke ARRAY
  if (videos && typeof videos === "object" && !Array.isArray(videos)) {
    videoList = Object.values(videos);
  }
  // Jika videos sudah ARRAY
  else if (Array.isArray(videos)) {
    videoList = videos;
  }
  else {
    console.log("[worker] ERROR: videos is not valid →", videos);
    return;
  }

  // Jika tetap kosong → stop
  if (videoList.length === 0) {
    console.log("[worker] No videos to process.");
    return;
  }

  // Hour limit logic
  let postedThisHour = 0;
  let hourReset = Date.now() + 3600_000;

  async function loop() {
    for (const v of videoList) {
      const videoId = v.videoId;
      if (!videoId) {
        console.log("[worker] Skipping invalid video:", v);
        continue;
      }

      for (let i = 0; i < perVideo; i++) {

        // Hourly limit protection
        if (postedThisHour >= hourlyLimit) {
          console.log("[worker] Hour limit reached. Waiting 1 hour...");
          await wait(3600_000);
          postedThisHour = 0;
          hourReset = Date.now() + 3600_000;
        }

        // Pick comment random
        const pick = comments[Math.floor(Math.random() * comments.length)];

        // Post comment
        console.log(`[worker] Posting → ${videoId}`);
        await postComment(videoId, pick.text);

        postedThisHour++;

        // Delay random
        const delay = random(delayMin, delayMax);
        console.log(`[worker] Delay ${delay}ms...`);
        await wait(delay);
      }
    }

    console.log("[worker] FINISHED 🎉");
  }

  loop();
}

// Helper
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const random = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

module.exports = { postComment, startWorker };
