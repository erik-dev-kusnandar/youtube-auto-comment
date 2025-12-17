require('dotenv').config();
const express = require('express');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const app = express();
// const PORT = process.env.PORT || 3000;
const PORT = 3001;

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const BASE_URL = process.env.BASE_URL;

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  `${BASE_URL}/oauth2callback`
);

const SCOPES = [
  "https://www.googleapis.com/auth/youtube",
  "https://www.googleapis.com/auth/youtube.force-ssl"
];

// Folder & file path
const TOKEN_DIR = path.join(__dirname, "../data");
const TOKEN_PATH = path.join(TOKEN_DIR, "tokens.json");

// Ensure folder exists
if (!fs.existsSync(TOKEN_DIR)) {
  fs.mkdirSync(TOKEN_DIR, { recursive: true });
  logger.info("Created /data folder.");
}

/** Generate OAuth URL */
app.get("/auth", (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });

  logger.info("Opening Google OAuth URL…");
  return res.redirect(url);
});

/** OAuth Callback */
app.get("/oauth2callback", async (req, res) => {
  const code = req.query.code;

  if (!code) {
    logger.error("No auth code received.");
    return res.send("Error: No authentication code received.");
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);

    logger.info("REFRESH TOKEN RECEIVED");
    logger.info(tokens.refresh_token);

    // Save to tokens.json
    const payload = {
      accounts: {
        default: {
          refresh_token: tokens.refresh_token,
          created_at: new Date().toISOString()
        }
      }
    };

    fs.writeFileSync(TOKEN_PATH, JSON.stringify(payload, null, 2));
    logger.info(`Saved refresh token into ${TOKEN_PATH}`);

    return res.send(`
      <h2>Success! Refresh Token Saved 🎉</h2>
      <p>File: <b>data/tokens.json</b></p>
      <pre>${tokens.refresh_token}</pre>
    `);

  } catch (err) {
    logger.error(err);
    return res.send("Error exchanging token. Check server log.");
  }
});

app.listen(PORT, () => {
  logger.info(`AUTH server running on port ${PORT}`);
});
