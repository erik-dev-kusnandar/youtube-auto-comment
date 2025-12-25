# 🤖 YouTube Auto-Comment AI Dashboard

An advanced, automated YouTube commenting system powered by AI, featuring context-awareness, sentiment analysis, and multi-user support.

## 🌟 Key Features

### 🧠 AI-Powered Comment Engine
*   **Context AI**: Analyzes video titles and descriptions to generate relevant comments.
*   **Sentiment Analysis**: 
    *   **Analyze Mode**: Detects video sentiment (Positive/Negative/Neutral) to adjust comment tone.
    *   **Random Mode**: Picks a random sentiment style.
*   **Smart Rewriter**: Uses OpenAI (GPT) to rewrite draft comments naturally, avoiding "bot-like" language.
*   **Guardrails**: Safety checks to filter unsafe or inappropriate content (Configurable).

### 🔐 Authentication & Security
*   **Secure Login/Register**: Built-in authentication system.
*   **Data Isolation**: Each user has their own private workspace:
    *   Private Data Store: `data/<username>/store_<username>.json`
    *   Private Uploads: `uploads/<username>/`
*   **Profile Management**: Update username, email, and password securely.

### 📊 Interactive Dashboard
*   **Live Progress**: Real-time tracking of posting status via Server-Sent Events (SSE).
*   **Dry-Run Mode**: Test your config and AI logic without actually posting to YouTube.
*   **Live Logs**: Detailed decision logs showing exactly *why* a comment was posted or skipped.

---

## 🛠️ Tech Stack
*   **Backend**: Node.js, Express.js
*   **Database**: SQLite (for User Auth & Session Store), JSON (for App Data)
*   **Frontend**: HTML5, Bootstrap 5, Vanilla JS
*   **AI Services**: OpenAI API
*   **YouTube Integration**: Google DeepMind / YouTube Data API v3

---

## 🚀 Installation & Setup

### 1. Prerequisites
*   Node.js (v16+)
*   Google Cloud Project with YouTube Data API v3 enabled.
*   OpenAI API Key.

### 2. Clone & Install
```bash
git clone <repository-url>
cd youtube-auto-comment
npm install
```

### 3. Environment Config
Copy `.env.template` to `.env` and fill in your credentials:
```bash
cp .env.template .env
```
Key variables:
*   `CLIENT_ID` & `CLIENT_SECRET` (from Google Cloud)
*   `OPENAI_API_KEY` (for AI features)
*   `SESSION_SECRET` (random string for security)

### 4. Authenticate YouTube
Run the auth script to generate your `tokens.json` (Required for API access):
```bash
npm run auth
```
*   Open the link provided in the terminal.
*   Authorize with your Google account.
*   Copy the code back to the terminal if prompted, or verify `data/tokens.json` is created.

### 5. Start the App
```bash
npm start
# OR for development (auto-restart)
npm run dev
```
Access the dashboard at: **http://localhost:3000**

---

## 📖 Usage Guide

### 1. Dashboard Overview
*   **Upload Video List**: CSV file containing `video_url` or `videoId`.
*   **Upload Comment List**: CSV file containing `comment_text`.
*   **Comment Engine Settings**: Toggle Context AI and Comment AI.
*   **Sentiment Settings**: Enable sentiment analysis (Random vs Analyze Video).

### 2. Start Posting
1.  Upload your CSV files.
2.  Configure your desired AI settings.
3.  Click **"Start Posting"**.
4.  Monitor progress in the "Live Log" and "Progress" table.

### 3. Profile & Data
*   Click your **Username** in the top-right corner to access **Profile Settings**.
*   Logout to secure your session.
*   All your data is saved automatically to your private `store_<username>.json`.

---

## 📂 Project Structure
```
├── data/                  # Data storage
│   ├── <username>/        # User-specific data folders
│   │   └── store_*.json   # User's video/comment/log db
│   └── tokens.json        # YouTube API Tokens (Shared)
├── public/                # Frontend assets (HTML/CSS/JS)
├── src/
│   ├── ai/                # AI Services (OpenAI, Sentiment)
│   ├── auth/              # Authentication Logic & Routes
│   ├── youtube/           # YouTube Worker & Upload Logic
│   ├── dataStore.js       # JSON Data Abstraction Layer
│   └── app.js             # Main Express App
└── uploads/               # Temporary upload handling
```

---

## ⚠️ Notes
*   **Quota**: Be mindful of YouTube API quotas (default 10,000 units/day). Posting a comment costs 50 units.
*   **Delays**: The worker includes randomized delays to prevent spam detection.
