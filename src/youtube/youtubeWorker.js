const store = require("../dataStore");
const logger = require("../logger");
const { postComment, fetchVideoMetadata } = require("./youtubeService");
const { buildCommentFromMetadata } = require("./metadataHelper");
const { rewriteComment } = require("../ai/aiCommentService");

const wait = ms => new Promise(r => setTimeout(r, ms));
const rand = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

async function startYoutubeWorker(opts = {}, pushLog = () => { }) {
  const data = store.getAll();
  const videos = data.videos || [];
  const comments = data.comments || [];

  if (!comments.length) {
    logger.error("No comments loaded!");
    return;
  }

  const perVideo = Number(opts.count || 1);
  const minDelay = Number(opts.minDelay || 60000);
  const maxDelay = Number(opts.maxDelay || 180000);
  const hourlyLimit = Number(opts.hourlyLimit || 100);

  let postedThisHour = 0;

  logger.info("YouTube worker started");

  // =========================
  // ✅ SATU-SATUNYA LOOP VIDEO
  // =========================
  for (const v of videos) {
    if (!v.videoId) continue;

    try {
      store.updateVideoStatus(v.videoId, "processing");

      const meta = await fetchVideoMetadata(v.videoId);
      const pick = comments[Math.floor(Math.random() * comments.length)];

      // STEP B
      let finalComment = buildCommentFromMetadata(meta, pick.text);

      // STEP C (AI OPTIONAL)
      if (process.env.ENABLE_AI_COMMENT === "true") {
        try {
          const ai = await rewriteComment({
            title: meta.title,
            description: meta.description.substring(0, 300),
            draft: finalComment,
          });

          if (ai && ai.length < 300) {
            finalComment = ai;
            logger.info(`[AI] ${finalComment}`);
          }
        } catch (aiErr) {
          logger.error(`AI error, fallback: ${aiErr.message}`);
        }
      }

      logger.info(`[FINAL COMMENT] ${finalComment}`);
      pushLog({ type: "process...", videoId: "videoId",  comment: finalComment });
      const randomWait = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
      pushLog({ type: "delay", message: `Waiting ${Math.floor(randomWait / 1000)}s before next comment…` });

      // ⛔ UNCOMMENT SAAT PRODUKSI
      await postComment(v.videoId, finalComment);

      store.updateVideoStatus(v.videoId, "done", finalComment);

      // const delay = rand(minDelay, maxDelay);
      // Random delay between posts

      await new Promise(r => setTimeout(r, randomWait));

      await wait(randomWait);

    } catch (err) {
      logger.error(`Worker error ${v.videoId}: ${err.message}`);
      store.updateVideoStatus(v.videoId, "error");
    }
  }

  logger.info("YouTube worker finished");
}

module.exports = { startYoutubeWorker };
