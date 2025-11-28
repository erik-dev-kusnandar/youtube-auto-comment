# YouTube Auto-Comment Dashboard

## Setup
1. Copy `.env.example` to `.env` and fill CLIENT_ID, CLIENT_SECRET.
2. Install:
   npm install
3. Start auth to get REFRESH_TOKEN:
   npm run auth
   - open http://localhost:3000/auth, allow Google, you'll see refresh token
   - copy refresh token into `.env`
4. Start server:
   npm start
5. Open UI:
   http://localhost:3000
6. Upload `videos.csv` and `comments.csv`, then click "Start Posting Comments".

## Notes
- CSV headers:
  - videos.csv: `video_url`
  - comments.csv: `comment_text`
- Logs are in `logs/` and printed to console.
- Configure `PROCESS_RATE_MS` in `.env` to set delay between posts.
