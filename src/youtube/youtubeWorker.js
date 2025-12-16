// src/youtube/youtubeWorker.js
const store = require("../dataStore");
const logger = require("../logger");
const { postComment, fetchVideoMetadata } = require("./youtubeService");
const { buildCommentFromMetadata } = require("./metadataHelper");
const { rewriteComment } = require("../ai/aiCommentService");

const wait = ms => new Promise(r => setTimeout(r, ms));
const rand = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

const usedPairs = new Set();
const isDuplicate = (videoId, comment) => {
  const key = `${videoId}||${comment}`;
  if (usedPairs.has(key)) return true;
  usedPairs.add(key);
  return false;
};

async function startYoutubeWorker(opts = {}, pushLog = () => {}) {
  const { videos = [], comments = [] } = store.getAll();

  if (!videos.length || !comments.length) {
    pushLog({ type: "error", message: "Videos or comments empty" });
    return;
  }

  const postingDuration = Number(opts.postingDuration || 600000); // default 10 menit
  const minDelay = Number(opts.minDelay || 60000);
  const maxDelay = Number(opts.maxDelay || 180000);

  const endTime = Date.now() + postingDuration;

  pushLog({ type: "info", message: `Worker started for ${postingDuration} ms` });
  logger.info("YouTube worker started");

  while (Date.now() < endTime) {
    const video = videos[Math.floor(Math.random() * videos.length)];
    const commentTpl = comments[Math.floor(Math.random() * comments.length)];

    try {
      store.updateVideoStatus(video.videoId, "processing");

      const meta = await fetchVideoMetadata(video.videoId);
      let finalComment = buildCommentFromMetadata(meta, commentTpl.text);

      // AI optional
      if (process.env.ENABLE_AI_COMMENT === "true") {
        try {
          const ai = await rewriteComment({
            title: meta.title,
            description: meta.description?.slice(0, 300) || "",
            draft: finalComment,
          });
          if (ai && ai.length < 300) finalComment = ai;
        } catch (e) {
          logger.warn("AI fallback:", e.message);
        }
      }

      if (isDuplicate(video.videoId, finalComment)) {
        logger.warn("Duplicate skipped");
      } else {
        await postComment(video.videoId, finalComment);

        store.updateVideoStatus(video.videoId, "done", finalComment);
        store.addPostingLog({
          videoId: video.videoId,
          comment: finalComment,
          time: new Date().toISOString(),
          status: "done",
        });

        pushLog({ type: "done", item: video, comment: finalComment });
      }
    } catch (err) {
      store.updateVideoStatus(video.videoId, "error");
      pushLog({ type: "error", item: video, message: err.message });
      logger.error(err.message);
    }

    const delay = rand(minDelay, maxDelay);
    pushLog({ type: "delay", message: `Waiting ${Math.floor(delay / 1000)}s` });
    await wait(delay);
  }

  pushLog({ type: "finished", message: "Posting duration finished" });
  logger.info("YouTube worker finished");
}

module.exports = { startYoutubeWorker };
