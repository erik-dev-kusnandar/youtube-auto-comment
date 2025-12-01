require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");
const logger = require("./logger");

const TOKEN_PATH = path.join(__dirname, "../data/tokens.json");

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

module.exports = { postComment };
