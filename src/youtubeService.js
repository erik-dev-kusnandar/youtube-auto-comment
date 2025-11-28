require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");
const logger = require("./logger");

const TOKEN_PATH = path.join(__dirname, "../data/tokens.json");
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const BASE_URL = process.env.BASE_URL;

function loadRefreshToken() {
  if (!fs.existsSync(TOKEN_PATH)) {
    throw new Error("tokens.json not found. Run: npm run auth");
  }

  const data = JSON.parse(fs.readFileSync(TOKEN_PATH));
  return data.accounts?.default?.refresh_token;
}

function createOAuthClient() {
  const refreshToken = loadRefreshToken();

  const oauth2Client = new google.auth.OAuth2(
    CLIENT_ID,
    CLIENT_SECRET,
    `${BASE_URL}/oauth2callback`
  );

  oauth2Client.setCredentials({ refresh_token: refreshToken });

  return oauth2Client;
}

async function postComment(videoId, message) {
  const auth = createOAuthClient();
  const youtube = google.youtube({ version: "v3", auth });

  try {
    const response = await youtube.commentThreads.insert({
      part: ["snippet"],
      requestBody: {
        snippet: {
          videoId,
          topLevelComment: {
            snippet: { textOriginal: message }
          }
        }
      }
    });

    logger.info(`Comment posted: ${response.data.id}`);
    return response.data;

  } catch (error) {
    logger.error("Failed to post comment");
    logger.error(error);
    throw error;
  }
}

module.exports = { postComment };
