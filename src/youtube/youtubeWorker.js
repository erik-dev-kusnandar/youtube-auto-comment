// src/youtube/youtubeWorker.js
const store = require("../dataStore");
const logger = require("../logger");
const { getEngine } = require("../engines");
const { fetchVideoMetadata } = require("./youtubeService");
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

  // ✅ [IMPROVEMENT] Increase default delays and duration to mimic human behavior
  // This reduces the chance of comments being marked as 'heldForReview' or spam.
  const postingDuration = Number(opts.postingDuration || 3600000); // default 1 hour
  const minDelay = Number(opts.minDelay || 300000); // 5 minutes
  const maxDelay = Number(opts.maxDelay || 600000); // 10 minutes

  // ✅ CHOOSE ENGINE BASED ON METHOD
  const method = opts.method || "api";
  const engine = getEngine(method);

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

  // ✅ [IMPROVEMENT] SHUFFLE VIDEOS
  // Randomizing the order prevents robotic sequential behavior visible in logs.
  const shuffledVideos = [...videos].sort(() => Math.random() - 0.5);

  const endTime = Date.now() + postingDuration;
  store.startWorker(username, postingDuration);

  pushLog({ type: "info", message: `Worker started (${method.toUpperCase()}) for ${postingDuration} ms` });
  pushLog({
    type: "config",
    runId,
    message:
      `method=${method.toUpperCase()} | ` +
      `context=${flowConfig.use_context ? "ON" : "OFF"} | ` +
      `sentiment=${flowConfig.sentiment.enabled ? "ON" : "OFF"} | ` +
      `sentimentMode=${flowConfig.sentiment.mode} | ` +
      `commentAI=${flowConfig.use_comment_ai ? "ON" : "OFF"}`
  });
  logger.info(`YouTube worker started for user: ${username} using method: ${method}`);
  console.log("DEBUG: fetchVideoMetadata type:", typeof fetchVideoMetadata);

  while (Date.now() < endTime) {

    // ⛔ STOP REQUEST CHECK
    if (store.shouldStop(username)) {
      pushLog({ type: "warn", message: "Stop requested, worker halted" });
      store.finishWorker(username);
      return;
    }

    const video = shuffledVideos[videoIndex];
    videoIndex = (videoIndex + 1) % shuffledVideos.length;

    const commentTpl = comments[Math.floor(Math.random() * comments.length)];

    try {
      store.updateVideoStatus(username, video.videoId, "processing");


      // ===== DECISION OBJECT =====
      const decision = {
        method, // Save method used
        use_context: flowConfig.use_context || false,
        sentiment_enabled: flowConfig.sentiment?.enabled || false,
        use_comment_ai: flowConfig.use_comment_ai || false,
        sentiment: "none",
        sentimentSource: null,
        source: "file" // default
      };


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
          const pool = store.getSentimentPool(username);
          if (pool && pool.length > 0) {
            targetSentiment = pool[Math.floor(Math.random() * pool.length)];
            decision.sentimentSource = "file";
          } else {
            targetSentiment = pickRandomSentiment();
            decision.sentimentSource = "random";
          }
        } else if (mode === "analyze") {
          if (contextSummary) {
            targetSentiment = await classifySentiment(contextSummary);
            decision.sentimentSource = "video_context";
          } else {
            targetSentiment = "neutral";
            decision.sentimentSource = "fallback";
          }
        }
        decision.sentiment = targetSentiment;
      }

      // 3. COMMENT GENERATION
      let finalComment = commentTpl.text;

      if (flowConfig.use_comment_ai) {
        decision.use_comment_ai = true;

        if (flowConfig.sentiment?.enabled) {
          finalComment = await applySentimentStyle({ text: finalComment, sentiment: targetSentiment });
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
        decision.source = "file";
      }

      // 4. GUARDRAIL
      const guard = await applyGuardrail(finalComment);


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

      // ✅ POST USING SELECTED ENGINE
      const result = await engine.post(video.videoId, finalComment, opts);

      if (result.status === "error") {
        logger.error(`Engine Error (${method}): ${result.message}`);
        store.updateVideoStatus(username, video.videoId, "error", result.message);
        pushLog({
          type: "video",
          runId,
          item: video,
          message: `❌ Engine Error: ${result.message}`
        });

        // ⛔ Check stop even on error
        if (store.shouldStop(username)) {
          pushLog({ type: "warn", message: "Stop requested after engine error" });
          store.finishWorker(username);
          return;
        }

        // Removed the 1s wait + continue to let it hit the main delay below, 
        // preventing "log storms" when something is broken (e.g. missing libs).
      } else {
        // ... (rest of logic for success)

        // LOGIC VISIBILITY CHECK DARI RESULT API / ENGINE
        decision.moderationStatus = result.moderationStatus || "published";
        decision.engine_msg = result.message || "";

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
      }
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
