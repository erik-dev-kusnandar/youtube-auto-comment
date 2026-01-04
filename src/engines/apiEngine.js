const { postComment } = require("../youtube/youtubeService");

class ApiEngine {
    async post(videoId, text) {
        // Standard returns for all engines
        const result = await postComment(videoId, text);
        return {
            status: "success",
            moderationStatus: result.moderationStatus || "published",
            engine: "api"
        };
    }
}

module.exports = new ApiEngine();
