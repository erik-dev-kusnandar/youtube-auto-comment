// src/youtube/youtubeRoutes.js
const express = require("express");
const uploadRouter = require("./youtubeUpload");
const uploadSensitiveRouter = require("../../routes/uploadSensitive");
const store = require("../dataStore");
const { startYoutubeWorker } = require("./youtubeWorker");
const { fetchVideoMetadata } = require("./youtubeService");
const { buildCommentFromMetadata } = require("./metadataHelper");
const { rewriteComment } = require("../ai/aiCommentService");
const defaultConfig = require("../../config/loadConfig");
const { applySentimentStyle } = require("../../services/sentimentStyle");
const { applyGuardrail } = require("../../services/guardrailService");
const { classifySentiment, pickRandomSentiment } = require("../../services/sentimentService");
const uploadSentimentRouter = require("../../routes/uploadSentiment");

let commentFlowConfig = {
  use_context: false,
  use_comment_ai: false
};


const flowConfig = commentFlowConfig;

const appiumEngine = require("../engines/appiumEngine");
const webEngine = require("../engines/webEngine");

module.exports = (pushLog) => {
  const router = express.Router();

  // Web Browser Setup Login
  router.post("/web/setup-login", async (req, res) => {
    try {
      // Run in background but handle errors
      webEngine.setupLogin().catch(e => {
        console.error("Setup login browser error:", e.message);
      });
      res.json({ ok: true, message: "Browser opening..." });
    } catch (e) {
      res.status(500).json({ ok: false, message: e.message });
    }
  });

  // Test Appium Connection
  router.post("/appium/test-connection", async (req, res) => {
    const { deviceId } = req.body;
    const ok = await appiumEngine.testConnection(deviceId);
    res.json({ ok });
  });

  // mount upload router at /upload
  router.use("/upload", uploadRouter);
  router.use("/upload", uploadSensitiveRouter);
  router.use("/upload", uploadSentimentRouter);

  // progress endpoint
  router.get("/progress", (req, res) => {
    const username = req.session.username;
    if (!username) return res.json({ videos: [], comments: [], postingLogs: [] });
    res.json(store.getAll(username));
  });

  router.post("/settings/comment-flow", (req, res) => {
    commentFlowConfig = {
      ...commentFlowConfig,
      ...req.body
    };

    console.log("Comment Flow Updated:", commentFlowConfig);

    res.json({ ok: true, config: commentFlowConfig });
  });


  // start worker with optional query params
  router.post("/start", (req, res) => {
    const username = req.session.username;
    if (!username) return res.status(401).json({ error: "Unauthorized" });

    const opts = {
      postingDuration: Number(req.body.postingDuration || req.query.postingDuration),
      minDelay: Number(req.body.minDelay || req.query.minDelay),
      maxDelay: Number(req.body.maxDelay || req.query.maxDelay),
      flowConfig: req.body.flowConfig || {},
      runId: req.body.runId || `RUN#${Date.now()}`,
      method: req.body.method,
      deviceId: req.body.deviceId,
      limitByDuration: req.body.limitByDuration
    };

    console.log("Start posting with config:", opts);

    // run worker async (do not block)
    startYoutubeWorker(username, opts, pushLog).catch(e => {
      console.error("Worker error:", e.message);
    });

    res.json({ ok: true, message: "Worker started with duration mode" });

  });

  router.get("/status", (req, res) => {
    const username = req.session.username;
    if (!username) return res.json({ running: false });
    res.json(store.getWorkerState(username));
  });

  router.post("/stop", (req, res) => {
    const username = req.session.username;
    if (username) {
      store.stopWorker(username);
      store.requestStop(username);
    }
    res.json({ ok: true });
  });

  router.post("/dry-run", async (req, res) => {
    try {
      const username = req.session.username;

      const { videos = [], comments = [] } = username ? store.getAll(username) : { videos: [], comments: [] };
      const runId = req.body.runId || `RUN#${Date.now()}`;

      // ✅ FIX: Read from req.body.flowConfig (sent by frontend)
      const flowConfig = {
        use_context:
          req.body.flowConfig?.use_context ??
          defaultConfig.comment_engine.use_context_ai,

        use_comment_ai:
          req.body.flowConfig?.use_comment_ai ??
          defaultConfig.comment_engine.use_comment_ai,

        sentiment: {
          enabled:
            req.body.flowConfig?.sentiment?.enabled ??
            defaultConfig.sentiment.enabled ??
            false,
          mode:
            req.body.flowConfig?.sentiment?.mode ??
            defaultConfig.sentiment.source ??
            "file"
        }
      };

      console.log("flowConfig:", flowConfig);

      pushLog({
        type: "config",
        runId,
        message:
          `context=${flowConfig.use_context ? "ON" : "OFF"} | ` +
          `sentiment=${flowConfig.sentiment.enabled ? "ON" : "OFF"} | ` +
          `sentimentMode=${flowConfig.sentiment.mode} | ` +
          `commentAI=${flowConfig.use_comment_ai ? "ON" : "OFF"}`
      });

      if (!videos.length || !comments.length) {
        return res.status(400).json({
          ok: false,
          message: "Videos or comments empty"
        });
      }

      const results = [];

      for (const video of videos) {

        const decision = {
          use_context: flowConfig.use_context,
          sentiment_enabled: flowConfig.sentiment?.enabled,
          use_comment_ai: flowConfig.use_comment_ai,
          sentiment: "none",
          sentimentSource: null,
          source: "file" // ⬅️ DEFAULT WAJIB
        };

        // ===== SENTIMENT =====
        if (flowConfig.sentiment?.enabled) {

          // ===== STYLE BY SENTIMENT (NO 3) =====
          if (decision.sentiment && decision.sentiment !== "none") {
            finalComment = applySentimentStyle({
              sentiment: decision.sentiment,
              text: finalComment
            });

            decision.source =
              (decision.source || "file") + "+sentiment-style";
          }

          // MODE: RANDOM (ambil dari file user)
          if (flowConfig.sentiment.mode === "file") {
            decision.sentiment = pickRandomSentiment();
            decision.sentimentSource = "file";
          }

          // MODE: ANALYZE (dari video)
          if (flowConfig.sentiment.mode === "analyze" && decision.use_context) {
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


        // SKIP IF SENSITIVE (DISABLED - User request 2025-12-25)
        // if (decision.sentiment === "sensitive") {
        //   pushLog({
        //     type: "skip",
        //     item: video,
        //     message: "Skipped due to sensitive sentiment"
        //   });
        //   continue;
        // }


        pushLog({
          type: "decision",
          runId,
          item: video,
          message:
            `context=${decision.use_context ? "ON" : "OFF"} | ` +
            `sentiment=${decision.sentiment_enabled ? "ON" : "OFF"} | ` +
            `sentimentMode=${decision.sentiment_mode || "none"} | ` +
            `commentAI=${decision.use_comment_ai ? "ON" : "OFF"} | ` +
            `source=${decision.source}`
        });

        console.log("Decision:", decision);


        let finalComment = null;
        let meta = null;

        // ambil template sekali
        const tpl =
          comments[Math.floor(Math.random() * comments.length)].text;

        // ===== TOGGLE A: CONTEXT =====
        if (decision.use_context) {
          meta = await fetchVideoMetadata(video.videoId);
          finalComment = buildCommentFromMetadata(meta, tpl);
          decision.source += "+context";
        } else {
          finalComment = tpl;
          decision.source = "file";
        }

        // ===== SENTIMENT (HANYA JIKA CONTEXT ON) =====
        if (decision.use_context && flowConfig.sentiment?.mode === "analyze") {
          try {
            decision.sentiment = pickRandomSentiment();
          } catch (e) {
            decision.sentiment = "neutral";
          }
        }

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
              item: video,
              message: "AI failed, fallback to previous draft"
            });
          }
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
            item: video,
            message: `Guardrail applied (sentiment=${decision.sentiment})`
          });
        }


        // ⛔ TIDAK POST
        store.updateVideoStatus(video.videoId, "preview", finalComment, {
          sentiment: decision.sentiment,
          sentimentSource: decision.sentimentSource,
          source: decision.source,
          use_context: decision.use_context,
          use_comment_ai: decision.use_comment_ai,
          sentiment_enabled: decision.sentiment_enabled
        });

        results.push({
          videoId: video.videoId,
          url: video.url,
          status: "preview",
          comment: finalComment,
          decision
        });

        // log detail per video push to frontend
        const logPayload = {
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
            preview: finalComment
          }
        };

        console.log("🔍 DRY-RUN pushLog payload:", JSON.stringify(logPayload, null, 2));
        pushLog(logPayload);
      }

      res.json({
        ok: true,
        mode: "dry-run",
        total: results.length,
        data: results
      });

      pushLog({
        type: "summary",
        runId,
        message: `${videos.length} video processed`
      });

    } catch (err) {
      console.error("Dry-run error:", err.message);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  return router;
};
