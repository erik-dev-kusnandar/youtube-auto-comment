// src/youtube/youtubeWorker.js
const store = require("../dataStore");
const logger = require("../logger");
const { postComment, fetchVideoMetadata } = require("./youtubeService");
const { buildCommentFromMetadata } = require("./metadataHelper");
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

async function startYoutubeWorker(opts = {}, pushLog = () => { }) {
  const { videos = [], comments = [] } = store.getAll();

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

  if (store.isWorkerRunning()) {
    pushLog({ type: "warn", message: "Worker already running, skip start" });
    return;
  }

  const endTime = Date.now() + postingDuration;
  store.startWorker(postingDuration);

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
  logger.info("YouTube worker started");

  while (Date.now() < endTime) {

    // ⛔ STOP REQUEST CHECK
    if (store.shouldStop()) {
      pushLog({ type: "warn", message: "Stop requested, worker halted" });
      store.finishWorker();
      return;
    }

    const video = videos[videoIndex];
    videoIndex = (videoIndex + 1) % videos.length;

    const commentTpl = comments[Math.floor(Math.random() * comments.length)];

    try {
      store.updateVideoStatus(video.videoId, "processing");


      // ===== DECISION OBJECT =====
      console.log("DEBUG flowConfig:", JSON.stringify(flowConfig, null, 2));

      const decision = {
        use_context: flowConfig.use_context || false,
        sentiment_enabled: flowConfig.sentiment?.enabled || false,
        use_comment_ai: flowConfig.use_comment_ai || false,
        sentiment: "none",
        sentimentSource: null,
        source: "file" // default
      };

      console.log("DEBUG decision:", JSON.stringify(decision, null, 2));

      let finalComment = null;
      let meta = null;

      // ambil template sekali
      const tpl = commentTpl.text;

      // ===== TOGGLE A: CONTEXT =====
      if (decision.use_context) {
        meta = await fetchVideoMetadata(video.videoId);
        finalComment = buildCommentFromMetadata(meta, tpl);
        decision.source = "file+context";
      } else {
        finalComment = tpl;
        decision.source = "file";
      }

      // ===== SENTIMENT =====
      if (flowConfig.sentiment?.enabled) {

        // MODE: RANDOM (ambil dari file user)
        if (flowConfig.sentiment.mode === "file" || flowConfig.sentiment.mode === "random") {
          decision.sentiment = pickRandomSentiment();
          decision.sentimentSource = "file";
        }

        // MODE: ANALYZE (dari video)
        if (flowConfig.sentiment.mode === "analyze" && decision.use_context && meta) {
          try {
            decision.sentiment = await classifySentiment({
              title: meta.title,
              description: meta.description?.slice(0, 500) || ""
            });
            decision.sentimentSource = "video";
          } catch (e) {
            decision.sentiment = "neutral";
            decision.sentimentSource = "fallback";
          }
        }
      } else {
        decision.sentiment = "none";
        decision.sentimentSource = "disabled";
      }

      // ⛔ SKIP IF SENSITIVE (DISABLED - User request 2025-12-25)
      // if (decision.sentiment === "sensitive") {
      //   pushLog({
      //     type: "skip",
      //     runId,
      //     item: video,
      //     message: "Skipped due to sensitive sentiment"
      //   });
      //   store.updateVideoStatus(video.videoId, "skipped", "sensitive sentiment");
      //   continue;
      // }

      // ===== TOGGLE B: AI COMMENT (FINAL AUTHORITY) =====
      if (decision.use_comment_ai) {
        try {
          const ai = await rewriteComment({
            title: meta?.title || "",
            description: meta?.description?.slice(0, 300) || "",
            draft: finalComment,
            sentiment: decision.sentiment
          });

          if (ai && ai.length < 300) {
            finalComment = ai;
            decision.source += "+ai";
          }
        } catch (e) {
          pushLog({
            type: "warn",
            runId,
            item: video,
            message: "AI failed, fallback to previous draft"
          });
        }
      }

      // ===== STYLE BY SENTIMENT =====
      if (decision.sentiment && decision.sentiment !== "none") {
        finalComment = applySentimentStyle({
          sentiment: decision.sentiment,
          text: finalComment
        });

        decision.source += "+sentiment-style";
      }

      // ===== GUARDRAIL =====
      const guard = applyGuardrail({
        sentiment: decision.sentiment,
        text: finalComment
      });

      if (guard.blocked) {
        finalComment = guard.text;
        decision.source += "+guardrail";

        pushLog({
          type: "warn",
          runId,
          item: video,
          message: `Guardrail applied (sentiment=${decision.sentiment})`
        });
      }

      // ===== CHECK DUPLICATE =====
      if (isDuplicate(video.videoId, finalComment)) {
        pushLog({
          type: "warn",
          runId,
          item: video,
          message: "Duplicate comment skipped",
        });
        continue;
      }

      // ===== POST COMMENT =====
      const postResult = await postComment(video.videoId, finalComment);
      const moderationStatus = postResult.moderationStatus || "published";

      store.updateVideoStatus(video.videoId, "done", finalComment, {
        sentiment: decision.sentiment,
        sentimentSource: decision.sentimentSource,
        source: decision.source,
        use_context: decision.use_context,
        use_comment_ai: decision.use_comment_ai,
        sentiment_enabled: decision.sentiment_enabled,
        moderationStatus
      });

      store.addPostingLog({
        videoId: video.videoId,
        comment: finalComment,
        time: new Date().toISOString(),
        status: "done",
        moderationStatus,
        decision
      });

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
            sentimentMode: flowConfig.sentiment?.mode || "none",
            source: decision.source
          },
          sentimentResult: decision.sentiment || "none",
          moderationStatus,
          preview: finalComment
        }
      });

      logger.info(`Comment posted on video ${video.videoId}`);

    } catch (err) {
      store.updateVideoStatus(video.videoId, "error");
      pushLog({ type: "error", runId, item: video, message: err.message });
      logger.error(err.message);
    }

    const delay = rand(minDelay, maxDelay);
    pushLog({ type: "delay", runId, message: `Waiting ${Math.floor(delay / 1000)}s` });
    await wait(delay);

  }

  store.stopWorker();
  store.finishWorker();

  pushLog({ type: "finished", runId, message: "Posting duration finished" });
  logger.info("YouTube worker finished");
}

module.exports = { startYoutubeWorker };
