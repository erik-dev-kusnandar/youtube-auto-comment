// src/youtube/youtubeWorker.js
const store = require("../dataStore");
const logger = require("../logger");
const { postComment, fetchVideoMetadata } = require("./youtubeService");
const { rewriteComment } = require("../ai/aiCommentService");
const { applySentimentStyle } = require("../../services/sentimentStyle");
const { applyGuardrail } = require("../../services/guardrailService");
const { classifySentiment, pickRandomSentiment } = require("../../services/sentimentService");
const defaultConfig = require("../../config/loadConfig");

const wait = ms => new Promise(r => setTimeout(r, ms));
const rand = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

const usedPairs = new Set();
const isDuplicate = (videoId, comment) => {
  const key = `${videoId}||${comment}`;
  if (usedPairs.has(key)) return true;
  usedPairs.add(key);
  return false;
};

let videoIndex = 0;

async function startYoutubeWorker(username, opts = {}, pushLog = () => { }) {
  if (!username) {
    pushLog({ type: "error", message: "Worker Error: No username provided" });
    return;
  }

  const { videos = [], comments = [] } = store.getAll(username);

  if (!videos.length || !comments.length) {
    pushLog({ type: "error", message: "Videos or comments empty" });
    return;
  }

  const postingDuration = Number(opts.postingDuration || 600000); // default 10 menit
  const minDelay = Number(opts.minDelay || 60000);
  const maxDelay = Number(opts.maxDelay || 180000);

  // ✅ GET FLOW CONFIG FROM OPTS
  const flowConfig = opts.flowConfig || {
    use_context: defaultConfig.comment_engine?.use_context_ai ?? false,
    use_comment_ai: defaultConfig.comment_engine?.use_comment_ai ?? false,
    sentiment: {
      enabled: defaultConfig.sentiment?.enabled ?? false,
      mode: defaultConfig.sentiment?.source ?? "file"
    }
  };

  const runId = opts.runId || `RUN#${Date.now()}`;

  if (store.isWorkerRunning(username)) {
    pushLog({ type: "warn", message: "Worker already running, skip start" });
    return;
  }

  const endTime = Date.now() + postingDuration;
  store.startWorker(username, postingDuration);

  pushLog({ type: "info", message: `Worker started for ${postingDuration} ms` });
  pushLog({
    type: "config",
    runId,
    message:
      `context=${flowConfig.use_context ? "ON" : "OFF"} | ` +
      `sentiment=${flowConfig.sentiment.enabled ? "ON" : "OFF"} | ` +
      `sentimentMode=${flowConfig.sentiment.mode} | ` +
      `commentAI=${flowConfig.use_comment_ai ? "ON" : "OFF"}`
  });
  logger.info(`YouTube worker started for user: ${username}`);

  while (Date.now() < endTime) {

    // ⛔ STOP REQUEST CHECK
    if (store.shouldStop(username)) {
      pushLog({ type: "warn", message: "Stop requested, worker halted" });
      store.finishWorker(username);
      return;
    }

    const video = videos[videoIndex];
    videoIndex = (videoIndex + 1) % videos.length;

    const commentTpl = comments[Math.floor(Math.random() * comments.length)];

    try {
      store.updateVideoStatus(username, video.videoId, "processing");


      // ===== DECISION OBJECT =====
      // console.log("DEBUG flowConfig:", JSON.stringify(flowConfig, null, 2));

      const decision = {
        use_context: flowConfig.use_context || false,
        sentiment_enabled: flowConfig.sentiment?.enabled || false,
        use_comment_ai: flowConfig.use_comment_ai || false,
        sentiment: "none",
        sentimentSource: null,
        source: "file" // default
      };

      // console.log("DEBUG decision:", JSON.stringify(decision, null, 2));


      // 1. CONTEXT ANALYSIS
      let contextSummary = "";
      let metadata = null; // ✅ Save metadata
      if (flowConfig.use_context) {
        metadata = await fetchVideoMetadata(video.videoId);
        contextSummary = metadata ? `${metadata.title} - ${metadata.description}` : "";
        decision.use_context = true;
      }

      // 2. SENTIMENT ANALYSIS
      let targetSentiment = "neutral";
      if (flowConfig.sentiment?.enabled) {
        decision.sentiment_enabled = true;
        const mode = flowConfig.sentiment.mode;
        decision.sentimentMode = mode;

        if (mode === "random") {
          // MODE RANDOM (from file or general pool)
          const pool = store.getSentimentPool(username);
          if (pool && pool.length > 0) {
            targetSentiment = pool[Math.floor(Math.random() * pool.length)];
            decision.sentimentSource = "file";
          } else {
            targetSentiment = pickRandomSentiment();
            decision.sentimentSource = "random";
          }
        } else if (mode === "analyze") {
          // MODE ANALYZE (from video context)
          if (contextSummary) {
            targetSentiment = await classifySentiment(contextSummary);
            decision.sentimentSource = "video_context";
          } else {
            targetSentiment = "neutral"; // fallback
            decision.sentimentSource = "fallback";
          }
        }

        // Remove skip logic - always post
        // if (targetSentiment === "sensitive") ...

        decision.sentiment = targetSentiment;
      }

      // 3. COMMENT GENERATION
      let finalComment = commentTpl.text;

      if (flowConfig.use_comment_ai) {
        decision.use_comment_ai = true;

        if (flowConfig.sentiment?.enabled) {
          finalComment = await applySentimentStyle(finalComment, targetSentiment);
          decision.source = "file+sentiment";
        }

        if (metadata && contextSummary) {
          finalComment = await rewriteComment({
            title: metadata.title,
            description: metadata.description?.slice(0, 500) || "",
            draft: finalComment
          });
          decision.source = "file+context+ai";
        }
      } else {
        // No AI rewrite, just pure file or minor adjustments
        decision.source = "file";
      }

      // 4. GUARDRAIL
      const guard = await applyGuardrail(finalComment);
      // if (!guard.safe) {
      //   store.updateVideoStatus(username, video.videoId, "skipped_unsafe", guard.reason);
      //   pushLog({
      //     type: "video",
      //     runId,
      //     item: video,
      //     message: `⚠️ Skipped Unsafe: ${guard.reason}`
      //   });
      //   continue;
      // }


      // 5. POSTING
      if (isDuplicate(video.videoId, finalComment)) {
        store.updateVideoStatus(username, video.videoId, "skipped_duplicate");
        pushLog({
          type: "video",
          runId,
          item: video,
          message: "⚠️ Skipped Duplicate"
        });
        await wait(1000);
        continue;
      }

      const result = await postComment(video.videoId, finalComment);

      // LOGIC VISIBILITY CHECK DARI RESULT API
      decision.moderationStatus = result.moderationStatus || "published";

      store.updateVideoStatus(username, video.videoId, "done", finalComment, decision);

      // STORE LOG (Persist to file)
      store.addPostingLog(username, {
        runId,
        videoId: video.videoId,
        comment: finalComment,
        status: "success",
        decision,
        timestamp: new Date().toISOString()
      });

      // PUSH LOG (SSE to Frontend)
      pushLog({
        type: "video",
        runId,
        item: video,
        message: {
          decision: {
            use_context: decision.use_context,
            sentiment_enabled: decision.sentiment_enabled,
            use_comment_ai: decision.use_comment_ai,
            sentimentSource: decision.sentimentSource,
            sentimentMode: decision.sentimentMode,
            source: decision.source
          },
          sentimentResult: decision.sentiment,
          moderationStatus: decision.moderationStatus,
          preview: finalComment
        }
      });

    } catch (e) {
      logger.error(`Error processing video ${video.videoId}: ${e.message}`);
      store.updateVideoStatus(username, video.videoId, "error", e.message);
      pushLog({
        type: "video",
        runId,
        item: video,
        message: `❌ Error: ${e.message}`
      });
    }

    const delay = rand(minDelay, maxDelay);
    pushLog({
      type: "info",
      message: `Waiting ${Math.round(delay / 1000)}s before next comment...`
    });
    await wait(delay);
  }

  store.finishWorker(username);
  pushLog({ type: "info", message: "Worker finished" });
  logger.info(`YouTube worker finished for user: ${username}`);
}

module.exports = { startYoutubeWorker };
