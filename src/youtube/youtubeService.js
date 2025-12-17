// src/youtube/youtubeService.js
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");
const logger = require("../logger");
const store = require("../dataStore");

const TOKEN_PATH = store.TOKEN_PATH;

function loadRefreshToken() {
  if (!fs.existsSync(TOKEN_PATH)) throw new Error("No token file");
  const data = JSON.parse(fs.readFileSync(TOKEN_PATH));
  return data.accounts.default.refresh_token;
}

function createClient() {
  const client = new google.auth.OAuth2(
    process.env.CLIENT_ID,
    process.env.CLIENT_SECRET,
    `${process.env.BASE_URL}/oauth2callback`
  );
  client.setCredentials({ refresh_token: loadRefreshToken() });
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
          topLevelComment: { snippet: { textOriginal: text } },
        },
      },
    });
    logger.info(`Comment posted → ${result.data.id} on ${videoId}`);
    return result.data;
  } catch (error) {
    const msg = error?.errors?.[0]?.message || error.message || "Unknown error";
    logger.error("Failed to post comment: " + msg);
    throw error;
  }
}

async function fetchVideoMetadata(videoId) {
  const auth = createClient();
  const yt = google.youtube({ version: "v3", auth });

  const res = await yt.videos.list({
    part: ["snippet"],
    id: [videoId],
  });

  if (!res.data.items || res.data.items.length === 0) {
    throw new Error("Video not found: " + videoId);
  }

  const snippet = res.data.items[0].snippet;

  return {
    title: snippet.title,
    description: snippet.description,
  };
}

module.exports = { 
  postComment,
  fetchVideoMetadata
 };
