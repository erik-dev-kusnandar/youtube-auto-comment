const store = require("../src/dataStore");
const { fetchVideoMetadata } = require("../src/youtube/youtubeService");
const { buildCommentFromMetadata } = require("../src/youtube/metadataHelper");
const { rewriteComment } = require("../src/ai/aiCommentService");

async function generateComment(video, flowConfig, mode = "dry-run") {
  const comments = store.getAll().comments;
  const template =
    comments[Math.floor(Math.random() * comments.length)].text;

  const decision = {
    use_context: flowConfig.use_context,
    use_comment_ai: flowConfig.use_comment_ai,
    mode,
    source: null
  };

  // A = NO, B = NO
  if (!flowConfig.use_context && !flowConfig.use_comment_ai) {
    decision.source = "file";
    return { comment: template, decision };
  }

  let meta = null;
  let draft = template;

  if (flowConfig.use_context) {
    meta = await fetchVideoMetadata(video.videoId);
    draft = buildCommentFromMetadata(meta, template);
  }

  if (flowConfig.sentiment?.enabled) {
    if (flowConfig.sentiment.mode === "analyze") {
      decision.sentiment = await analyzeSentimentFromVideo({
        title: meta.title,
        description: meta.description
      });
      decision.sentimentSource = "video";
    }

    if (flowConfig.sentiment.mode === "random") {
      decision.sentiment = pickRandomSentiment(
        store.getSentimentPool()
      );
      decision.sentimentSource = "random";
    }
  }

  // A = YES, B = NO
  if (flowConfig.use_context && !flowConfig.use_comment_ai) {
    decision.source = "file+context";
    return { comment: draft, decision };
  }

  // A = NO, B = YES
  if (!flowConfig.use_context && flowConfig.use_comment_ai) {
    decision.source = "file+ai";
    const ai = await rewriteComment({
      title: "",
      description: "",
      draft
    });
    return { comment: ai || draft, decision };
  }

  // A = YES, B = YES
  decision.source = "file+context+ai";
  const ai = await rewriteComment({
    title: meta.title,
    description: meta.description?.slice(0, 300) || "",
    draft
  });

  return { comment: ai || draft, decision };
}

module.exports = { generateComment };
