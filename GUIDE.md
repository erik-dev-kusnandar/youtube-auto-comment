# YouTube Auto-Comment AI Dashboard — Panduan Lengkap

## Daftar Isi
1. [Apa Itu Project Ini?](#1-apa-itu-project-ini)
2. [Tech Stack](#2-tech-stack)
3. [Setup & Environment Variables](#3-setup--environment-variables)
4. [Flow Aplikasi End-to-End](#4-flow-aplikasi-end-to-end)
5. [Alur Worker (Jantung Aplikasi)](#5-alur-worker-jantung-aplikasi)
6. [YouTube OAuth Setup](#6-youtube-oauth-setup)
7. [Posting Engine: API (YouTube Data API v3)](#7-posting-engine-api-youtube-data-api-v3)
8. [Posting Engine: Web (Puppeteer)](#8-posting-engine-web-puppeteer)
9. [Posting Engine: Appium (Android Mobile)](#9-posting-engine-appium-android-mobile)
10. [AI Pipeline: Comment Generation](#10-ai-pipeline-comment-generation)
11. [Sentiment Analysis & Style](#11-sentiment-analysis--style)
12. [Guardrail Service](#12-guardrail-service)
13. [Spintax](#13-spintax)
14. [Upload CSV: Format Video & Comment](#14-upload-csv-format-video--comment)
15. [Data Store (Penyimpanan per User)](#15-data-store-penyimpanan-per-user)
16. [Struktur Direktori](#16-struktur-direktori)
17. [Cara Menjalankan](#17-cara-menjalankan)

---

## 1. Apa Itu Project Ini?

**YouTube Auto-Comment AI Dashboard** adalah aplikasi full-stack Node.js untuk **mengotomatisasi komentar di YouTube** dengan kecerdasan buatan (AI). Bukan sekadar spam bot — ini adalah **decision engine** yang menghasilkan komentar kontekstual, relevan, dan mirip manusia.

### Fitur Utama:
- **3 metode posting:** YouTube Data API v3, Puppeteer (Web), Appium (Android)
- **AI-powered comment:** OpenAI GPT-4.1-mini untuk rewrite & generate komentar
- **Context AI:** Ambil judul & deskripsi video, injeksi ke template komentar
- **Sentiment Analysis:** Deteksi sentimen video, kasih gaya bahasa sesuai sentimen
- **Guardrail:** Filter komentar sensitif/negatif diganti dengan yang aman
- **Spintax:** Variasi teks otomatis dengan sintaks `{pilihan1|pilihan2}`
- **Dry-Run Preview:** Lihat hasil komentar sebelum posting beneran
- **Real-time SSE:** Log live di dashboard via Server-Sent Events
- **Multi-user:** Register/login, data terisolasi per user (JSON store)
- **CSV Upload:** Upload daftar video & template komentar lewat file CSV

---

## 2. Tech Stack

| Layer | Teknologi |
|---|---|
| **Runtime** | Node.js (v16+) |
| **Backend** | Express.js v4.22 |
| **Database** | SQLite (Sequelize ORM untuk auth) + JSON files (data per user) |
| **AI / LLM** | OpenAI API (GPT-4.1-mini) |
| **YouTube API** | Google APIs Node.js Client (YouTube Data API v3) |
| **Web Automation** | Puppeteer v24 + Puppeteer-Extra + Stealth Plugin |
| **Mobile Automation** | WebDriverIO v9 (Appium) |
| **Auth** | express-session + connect-sqlite3 + bcrypt |
| **Frontend** | HTML5, Bootstrap 5, Vanilla JS, PapaParse (CSV), SSE |
| **Logging** | Winston |
| **File Upload** | Multer |
| **Config** | dotenv |

---

## 3. Setup & Environment Variables

### 3.1 File `.env`

Buat file `.env` di root project:

```env
CLIENT_ID=your_google_oauth_client_id
CLIENT_SECRET=your_google_oauth_client_secret
OPENAI_API_KEY=your_openai_api_key
BASE_URL=http://localhost:3000
SESSION_SECRET=your_session_secret
PORT=3000
```

### 3.2 Variabel Environment

| Variabel | Digunakan di | Fungsi |
|---|---|---|
| `CLIENT_ID` | `youtubeAuth.js`, `youtubeService.js`, `auth.js` | Google OAuth Client ID untuk YouTube Data API |
| `CLIENT_SECRET` | Sama seperti di atas | Google OAuth Client Secret |
| `OPENAI_API_KEY` | `aiCommentService.js`, `openaiService.js` | API key OpenAI untuk GPT comment generation |
| `BASE_URL` | `youtubeAuth.js`, `youtubeService.js` | Public base URL (e.g. `http://localhost:3000`) untuk OAuth callback |
| `SESSION_SECRET` | `app.js` (saat ini hardcoded) | Secret untuk session encryption |
| `PORT` | `app.js` | Port server (default 3000) |

### 3.3 Config JSON

**`config/config.json`** — Konfigurasi default engine:
```json
{
  "comment_engine": {
    "use_context_ai": true,
    "use_comment_ai": true
  },
  "sentiment": {
    "enabled": true,
    "source": "file"
  },
  "post_mode": "dry",
  "limits": {
    "max_posts_per_run": 3,
    "delay_ms": 120000
  }
}
```

### 3.4 File Prompt AI

- **`config/prompts/rewrite_comment.txt`** — System prompt untuk AI rewrite comment. Gaya: netizen Indonesia lugas & messy, lowercase, typo wajar, 1-2 kalimat.
- **`config/prompts/pure_comment.txt`** — System prompt untuk AI generate dari nol (tanpa draft). Gaya sama.

Keduanya menggunakan placeholder `{{title}}`, `{{description}}`, `{{draft}}`.

---

## 4. Flow Aplikasi End-to-End

```
                          ┌─────────────────────┐
                          │   Browser (User)     │
                          │  public/index.html   │
                          └──────────┬──────────┘
                                     │
                                     ▼
                    ┌────────────────────────────────┐
                    │       Express Server            │
                    │         src/app.js              │
                    └────────────────────────────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │                │                │
                    ▼                ▼                ▼
            ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
            │  Auth Routes │ │  Static      │ │  YouTube     │
            │  (Public)    │ │  Assets      │ │  Routes      │
            │  /login      │ │  /css /js    │ │  (Protected) │
            │  /register   │ │  /img        │ │  /start      │
            └──────────────┘ └──────────────┘ │  /dry-run    │
                                              │  /stop       │
                                              │  /upload/*   │
                                              │  /progress   │
                                              └──────┬───────┘
                                                     │
                        ┌────────────────────────────┼────────────────────────────┐
                        │                            │                            │
                        ▼                            ▼                            ▼
                ┌──────────────┐             ┌──────────────┐             ┌──────────────┐
                │  API Engine  │             │  Web Engine  │             │Appium Engine │
                │(Data API v3) │             │  (Puppeteer) │             │  (Android)   │
                └──────────────┘             └──────────────┘             └──────────────┘
                        │                            │                            │
                        ▼                            ▼                            ▼
                ┌──────────────┐             ┌──────────────┐             ┌──────────────┐
                │ YouTube API  │             │   Chromium   │             │  Appium +    │
                │   Server     │             │  (Headless)  │             │  Device/Emu  │
                └──────────────┘             └──────────────┘             └──────────────┘
```

### Langkah-langkah detail:

1. **Login/Register** — User login via `/login`. Session disimpan di SQLite. Default admin: `admin / admin123`.
2. **YouTube OAuth** — User authorize via `/auth` → Google consent → dapet refresh token, disimpan di `data/tokens.json`.
3. **Upload CSV** — Upload video CSV & comment CSV. Data disimpan per user di `data/<username>/store_<username>.json`.
4. **Konfigurasi** — Atur toggle di dashboard: Context AI, Comment AI, Sentiment, Posting Method, Timer.
5. **Dry-Run** — Klik "Dry-Run Preview" → server proses semua video tanpa posting → tampilkan hasil preview.
6. **Start Posting** — Klik "Start Posting" → worker loop berjalan.
7. **Monitoring** — Lihat progress real-time via SSE log. Bisa Stop kapan saja.

---

## 5. Alur Worker (Jantung Aplikasi)

**File:** `src/youtube/youtubeWorker.js`

Ini adalah inti dari aplikasi. Fungsi `startYoutubeWorker()` adalah main loop yang memproses setiap video.

### Flow Worker:

```
                     ┌─────────────────────────────────┐
                     │       START WORKER               │
                     │  Load videos & comments dari store│
                     │  Pilih engine (api/web/appium)    │
                     │  Shuffle videos (biar acak)       │
                     └──────────────┬──────────────────┘
                                    │
                                    ▼
                     ┌─────────────────────────────────┐
                     │        MAIN LOOP                │
                     │  ┌───────────────────────────┐  │
                     │  │ 1. Check Stop Condition   │  │
                     │  │    - Timer habis? → Break │  │
                     │  │    - List habis? → Break  │  │
                     │  │    - Stop diminta? → Exit │  │
                     │  └───────────┬───────────────┘  │
                     │              ▼                   │
                     │  ┌───────────────────────────┐  │
                     │  │ 2. Pilih Video (Round-    │  │
                     │  │    Robin, videoIndex++)   │  │
                     │  └───────────┬───────────────┘  │
                     │              ▼                   │
                     │  ┌───────────────────────────┐  │
                     │  │ 3. Pilih Comment Random   │  │
                     │  │    (Math.random)          │  │
                     │  └───────────┬───────────────┘  │
                     │              ▼                   │
                     │  ┌───────────────────────────┐  │
                     │  │ 4. Context Analysis       │  │
                     │  │    - If method=WEB:       │  │
                     │  │      buat aiCallback      │  │
                     │  │    - Else: fetch metadata │  │
                     │  │      via YouTube API      │  │
                     │  └───────────┬───────────────┘  │
                     │              ▼                   │
                     │  ┌───────────────────────────┐  │
                     │  │ 5. Sentiment Analysis     │  │
                     │  │    - Mode RANDOM: ambil   │  │
                     │  │      dari pool/file       │  │
                     │  │    - Mode ANALYZE:        │  │
                     │  │      classify dari konteks│  │
                     │  └───────────┬───────────────┘  │
                     │              ▼                   │
                     │  ┌───────────────────────────┐  │
                     │  │ 6. Comment Generation     │  │
                     │  │    - Process spintax      │  │
                     │  │    - Apply sentiment style│  │
                     │  │    - AI rewrite (jika ON) │  │
                     │  └───────────┬───────────────┘  │
                     │              ▼                   │
                     │  ┌───────────────────────────┐  │
                     │  │ 7. Guardrail              │  │
                     │  │    - Sensitive/Negative?  │  │
                     │  │    → Ganti dgn safe comment│  │
                     │  └───────────┬───────────────┘  │
                     │              ▼                   │
                     │  ┌───────────────────────────┐  │
                     │  │ 8. Duplicate Check        │  │
                     │  │    (videoId + comment)    │  │
                     │  └───────────┬───────────────┘  │
                     │              ▼                   │
                     │  ┌───────────────────────────┐  │
                     │  │ 9. POST via Engine        │  │
                     │  │    engine.post(videoId,   │  │
                     │  │      finalComment, opts)  │  │
                     │  └───────────┬───────────────┘  │
                     │              ▼                   │
                     │  ┌───────────────────────────┐  │
                     │  │ 10. Delay Random          │  │
                     │  │     Min: 5 menit (default)│  │
                     │  │     Max: 10 menit (default)│  │
                     │  │     + responsive stop     │  │
                     │  └───────────┬───────────────┘  │
                     │              ▼                   │
                     │      Kembali ke step 1          │
                     └─────────────────────────────────┘
```

### Detail Kode Worker:

**Start worker:**
```javascript
async function startYoutubeWorker(username, opts = {}, pushLog = () => {})
```
- `username`: user yang menjalankan worker
- `opts`: `{ postingDuration, minDelay, maxDelay, flowConfig, method, deviceId, limitByDuration, runId }`
- `pushLog`: callback untuk SSE logging ke frontend

**Stop condition (2 mode):**
1. **Duration Mode (default):** Worker berhenti setelah `postingDuration` ms (default 1 jam)
2. **List Mode:** Worker berhenti setelah semua video di list selesai diproses

**Delay antar komentar:**
```javascript
const minDelay = Number(opts.minDelay || 30000); // 0,5 menit
const maxDelay = Number(opts.maxDelay || 60000); // 1 menit
```
Delay dibuat random antara min-max biak natural. Ada `waitWithStopCheck()` yang ngecek tiap detik apakah user minta stop.

**Smart Engine untuk Web Method:**
Kalau method = "web" dan Context AI ON, worker nggak fetch metadata via YouTube API. Sebagai gantinya, bikin `aiCallback` function yang bakal dipanggil **di dalem** WebEngine setelah Puppeteer scrape metadata dari DOM YouTube langsung.

---

## 6. YouTube OAuth Setup

**File:** `src/auth/youtubeAuth.js`

### Kenapa perlu OAuth?
YouTube Data API v3 butuh akses token untuk posting comment. Token didapet dari Google OAuth 2.0 flow.

### Langkah-langkah Setup:

1. **Buat project di Google Cloud Console:**
   - Buka https://console.cloud.google.com/
   - Create New Project (atau pilih existing)
   - Enable APIs & Services → YouTube Data API v3

2. **Buat OAuth 2.0 Credentials:**
   - APIs & Services → Credentials → Create Credentials → OAuth Client ID
   - Application type: Web application
   - Authorized redirect URIs: `http://localhost:3000/oauth2callback` (sesuai BASE_URL)
   - Copy `CLIENT_ID` dan `CLIENT_SECRET` ke `.env`

3. **Isi .env:**
   ```env
   CLIENT_ID=xxx.apps.googleusercontent.com
   CLIENT_SECRET=GOCSPX-xxxx
   BASE_URL=http://localhost:3000
   ```

4. **Jalankan OAuth Flow:**
   - Buka `http://localhost:3000/auth`
   - Login dengan Google account yang akan dipakai
   - Klik Allow/Consent
   - Refresh token otomatis tersimpan ke `data/tokens.json`

### Struktur Token (`data/tokens.json`):
```json
{
  "accounts": {
    "default": {
      "refresh_token": "1//0gABCDEFGHIJK...",
      "created_at": "2026-07-31T..."
    }
  }
}
```

### Scopes yang diminta:
```javascript
const SCOPES = [
  "https://www.googleapis.com/auth/youtube",
  "https://www.googleapis.com/auth/youtube.force-ssl"
];
```

---

## 7. Posting Engine: API (YouTube Data API v3)

**File:** `src/engines/apiEngine.js`

### Cara Kerja:
Paling sederhana — panggil YouTube Data API v3 `commentThreads.insert()`.

### Kode:
```javascript
class ApiEngine {
    async post(videoId, text) {
        const result = await postComment(videoId, text);
        return {
            status: "success",
            moderationStatus: result.moderationStatus || "published",
            engine: "api"
        };
    }
}
```

### Fungsi `postComment` di `youtubeService.js`:
```javascript
async function postComment(videoId, text) {
    const auth = createClient(); // OAuth2 client dengan refresh token
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
    // ...
}
```

### Kelebihan & Kekurangan:
| Plus | Minus |
|---|---|
| Cepat & stabil | Comment masuk moderation (heldForReview) |
| Nggak perlu browser | Kena quota limit API |
| Mudah di-debug | Kena rate limiting |

### Moderation Status:
- `published` — Langsung tampil
- `heldForReview` — Ditahan YouTube untuk review (mungkin butuh waktu/jam)

---

## 8. Posting Engine: Web (Puppeteer)

**File:** `src/engines/webEngine.js`

### Cara Kerja:
Menggunakan Puppeteer-Extra dengan Stealth Plugin untuk mengotomatisasi browser Chromium. Mirip manusia beneran — ngetik karakter per karakter, scroll, nunggu random.

### Setup Login (Pertama Kali):

**Endpoint:** `POST /web/setup-login`

Fungsi `setupLogin()`:
1. Buka browser **non-headless** (kelihatan)
2. Arahkan ke `https://www.youtube.com`
3. User login manual di browser yang terbuka
4. Setiap 5 detik, cookies disimpan ke `data/youtube_cookies.json`
5. Tutup browser → cookies siap dipakai

### Alur Posting:

```
1. Launch Browser
   - headless: true (default)
   - userDataDir: ./puppeteer_data/
   - Stealth Plugin ON (anti-deteksi)

2. Load Cookies
   - Baca dari data/youtube_cookies.json
   - Set ke browser page

3. Navigate ke Video
   - https://www.youtube.com/watch?v={videoId}
   - Wait until network idle

4. Initial Delay (2-5 detik)
   - Simulasi "melihat" halaman

5. Scrape Metadata (SMART ENGINE)
   - title: h1.ytd-watch-metadata
   - description: #description-inline-expander
   - Kirim ke aiCallback (dari Worker)

6. Scroll Pelan-Pelan (5x scroll)
   - 300-700px per scroll
   - Delay 1.5-3.5 detik antar scroll

7. Cari Comment Section
   - waitForSelector #comments
   - Scroll tambahan kalau perlu

8. Click Placeholder
   - Coba beberapa selector: ytd-comment-simplebox-renderer, #simplebox-placeholder, dll

9. Type Comment (Human-like)
   - Per karakter, delay 40-150ms
   - Random pause 0.8-2 detik setiap 3% karakter
   - Handle enter (\n) dan carriage return (\r)

10. Find & Click Submit
    - Coba beberapa selector submit button
    - Cek apakah button disabled

11. Verify Post
    - Tunggu 10 detik
    - Cek apakah text masih di input box
    - Cek apakah comment muncul di #content-text

12. Post-Post Stay (10-20 detik)
    - Scroll random sebelum keluar
    - Biar keliatan natural

13. Close Browser
```

### Kelebihan & Kekurangan:
| Plus | Minus |
|---|---|
| Lebih jarang kena moderation | Lambat (butuh browser) |
| Keliatan seperti manusia | Boros resource (RAM/CPU) |
| Bisa scraping metadata langsung | Rawan deteksi bot |
| Bisa bypass rate limit API | Setup login ribet |

### Selector yang Dipakai:

**Comment placeholder:**
```javascript
const placeholderSelectors = [
    "ytd-comment-simplebox-renderer",
    "#simplebox-placeholder",
    "yt-formatted-string#simplebox-placeholder",
    "#placeholder-area"
];
```

**Input area:**
```javascript
const inputSelectors = [
    "#contenteditable-root",
    "div#contenteditable-root[contenteditable='true']",
    "[aria-label='Add a comment...']",
    "[aria-label='Tambahkan komentar...']",
    "#contenteditable-textarea",
    "ytd-commentbox #contenteditable-root"
];
```

**Submit button:**
```javascript
const submitBtnSelectors = [
    "ytd-button-renderer#submit-button",
    "#submit-button ytd-button-renderer",
    "#submit-button button[aria-label='Comment']",
    "#submit-button button[aria-label='Komentar']",
    "#submit-button button",
    "ytd-button-renderer.ytd-commentbox#submit-button"
];
```

---

## 9. Posting Engine: Appium (Android Mobile)

**File:** `src/engines/appiumEngine.js`

### Cara Kerja:
Menggunakan WebDriverIO untuk remote ke Appium server, lalu mengotomatisasi YouTube app di Android device/emulator.

### Prasyarat:
1. Install Appium: `npm install -g appium`
2. Install Appium Driver: `appium driver install uiautomator2`
3. Android device/emulator terhubung (cek dengan `adb devices`)
4. YouTube app sudah terinstall di device

### Koneksi ke Appium:
```javascript
const opts = {
    hostname: "127.0.0.1",
    port: 4723,
    capabilities: {
        platformName: "Android",
        "appium:automationName": "UiAutomator2",
        "appium:deviceName": deviceId || "Android",
        "appium:noReset": true, // Keep user logged in
        "appium:appPackage": "com.google.android.youtube",
        "appium:appActivity": "com.google.android.apps.youtube.app.watchwaitlist.WatchWaitListActivity",
    },
};
```

### Alur Posting:

```
1. Connect ke device (via Appium)
2. Buka video via Deep Link:
   - vnd.youtube:{videoId}
3. Tunggu video load (5 detik)
4. Scroll ke comment section
5. Cari element "Add a comment"
6. Click, tunggu keyboard
7. Type comment (setValue)
8. Cari tombol Send
   - content-desc="Send"
   - atau resource-id="send_button"
9. Click Send
10. Close session
```

### Test Connection:
```javascript
async testConnection(deviceId) {
    // Coba bikin session → kalau sukses, device terhubung
    driver = await this._getDriver(deviceId);
    return true; // Kalau gagal throw error
}
```

### Kelebihan & Kekurangan:
| Plus | Minus |
|---|---|
| Keliatan seperti real user | Paling lambat |
| Mobile traffic = lebih aman | Butuh Appium server |
| Nggak kena rate limit API | Setup lebih kompleks |
| Bisa pakai banyak device | Butuh device/emulator |

---

## 10. AI Pipeline: Comment Generation

**File:** `src/ai/aiCommentService.js`

### Dua Mode AI:

#### 1. Rewrite Mode (Default)
Dari draft template → di-rewrite AI jadi gaya netizen.

```
Flow: Draft Template → AI Rewrite → Output
Prompt: rewrite_comment.txt
```

#### 2. Pure AI Mode (tanpa draft)
AI generate comment dari nol berdasarkan konteks video.

```
Flow: Judul + Deskripsi → AI Generate → Output
Prompt: pure_comment.txt
```

### Cara Kerja `rewriteComment()`:

```javascript
async function rewriteComment({ title, description, draft }) {
    // Kalau tanpa draft → panggil generatePureComment
    if (!draft) {
        return generatePureComment({ title, description });
    }

    // Load prompt dari file
    let promptTemplate = getPromptContent("rewrite_comment");

    // Replace placeholders
    const prompt = promptTemplate
        .replace(/{{title}}/g, title || "")
        .replace(/{{description}}/g, description?.slice(0, 300) || "")
        .replace(/{{draft}}/g, draft || "");

    // Panggil OpenAI
    const res = await client.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.9,
    });

    return res.choices[0].message.content.trim();
}
```

### Prompt AI (Rewrite):
```
Anda adalah netizen Indonesia asli yang sedang menonton video di YouTube.
Tulis ulang komentar (draft) di bawah agar terdengar SANGAT LUGAS, BLAK-BLAKAN, dan NATURAL (bukan bot).

ATURAN BAHASA (Style Netizen Indo Lugas & Messy):
1. JANGAN KAKU & JANGAN RAPI! Pakai huruf kecil semua (lowercase) lebih sering.
2. SENGAJA buat typo dikit (contoh: "yg" jadi "ygh", "banget" jadi "bgt").
3. Langsung ke inti (Lugas). Ekspresikan emosi/opini tanpa basa-basi.
4. Maksimal 1-2 kalimat pendek. Gak perlu tanda titik di akhir.
5. Maksimal 1 emoji yang ekspresif.
```

### AI Mode di Worker:

```javascript
// Mode: rewrite (default)
// Comment AI ON + ada draft:
//   - Context AI ON: AI review judul/desc + draft as footer
//   - Context AI OFF: AI rewrite draft doang

// Mode: pure
// Comment AI ON + NO draft:
//   - AI generate dari context (judul + deskripsi)
```

### Prompt Loading:
```javascript
function getPromptContent(name) {
    // Priority: config/prompts/{name}.txt
    // Fallback: config/prompts.json (key = name)
    // Fallback: hardcoded default
}
```

---

## 11. Sentiment Analysis & Style

### 11.1 Sentiment Service

**File:** `services/sentimentService.js`

#### Fungsi `classifySentiment()`:
Mengklasifikasikan teks ke 5 kategori: `positive | neutral | negative | sensitive | ambiguous`

**Metode:**
1. **Rule-based pre-check:** Cek keyword sensitif (politik, agama, perang, dll) → langsung return "sensitive"
2. **LLM Classification:** Kalau lolos pre-check, kirim ke OpenAI buat klasifikasi
3. **Fallback:** Kalau gagal → return "neutral"

```javascript
async function classifySentiment({ title = "", description = "" }) {
    // Rule-based check
    const sensitiveKeywords = [
        "politik", "agama", "konflik", "perang", "pemilu",
        "kecelakaan", "meninggal", "bencana", "korupsi", "hukum"
    ];
    if (sensitiveKeywords.some(k => lower.includes(k))) {
        return "sensitive";
    }

    // LLM classification via rewriteComment
    const res = await rewriteComment({
        title: "Sentiment Classifier",
        description: "",
        draft: prompt  // "Klasifikasikan sentimen teks berikut..."
    });
}
```

#### Fungsi `pickRandomSentiment()`:
Ambil sentimen random dari pool user (diupload via CSV). Kalau kosong → "neutral".

### 11.2 Sentiment Style

**File:** `services/sentimentStyle.js`

Setiap sentimen punya style prefix yang di-prepend ke comment:

```javascript
const STYLE_PREFIX = {
    positive: ["Keren banget!", "Mantap sih ini.", "Seru banget nontonnya."],
    "very positive": ["Gila, ini keren parah!", "Sumpah ini top banget!"],
    neutral: ["Menarik juga pembahasannya.", "Penjelasannya cukup jelas."],
    negative: ["Agak disayangkan sih.", "Semoga ke depannya bisa lebih baik."],
    sensitive: ["Topik ini memang cukup sensitif.", "Perlu dibahas dengan hati-hati."],
    ambiguous: ["Menarik, tapi masih agak membingungkan.", "Masih terbuka untuk banyak sudut pandang."]
};
```

Fungsi `applySentimentStyle({ sentiment, text })`:
- Pilih random prefix dari pool sesuai sentiment
- Cek anti-double-prefix
- Gabung: `"${prefix} ${text}"`

### 11.3 Sentiment Mode di Flow Config:

| Mode | Cara Kerja |
|---|---|
| **random** | Ambil sentimen random dari pool user (file) atau random fallback |
| **analyze** | Klasifikasi sentimen dari judul + deskripsi video via AI |

---

## 12. Guardrail Service

**File:** `services/guardrailService.js`

Safety net — kalau sentimen terdeteksi "sensitive" atau "negative", seluruh komentar diganti dengan versi yang aman.

```javascript
const SAFE_COMMENTS = {
    sensitive: [
        "Topik ini memang cukup kompleks, semoga dibahas dengan bijak.",
        "Isu seperti ini memang perlu disikapi dengan hati-hati."
    ],
    negative: [
        "Semoga ke depannya bisa lebih baik.",
        "Ini bisa jadi bahan evaluasi ke depan."
    ]
};

function applyGuardrail({ sentiment, text }) {
    if (sentiment === "sensitive" || sentiment === "negative") {
        const pool = SAFE_COMMENTS[sentiment];
        const safe = pool[Math.floor(Math.random() * pool.length)];
        return { text: safe, blocked: true };
    }
    return { text, blocked: false };
}
```

Kalau `blocked: true`, di worker log akan muncul "Guardrail applied (sentiment=...)" dan comment diganti dengan versi aman.

---

## 13. Spintax

**File:** `src/utils.js`

### Apa itu Spintax?
Teknik menulis teks dengan variasi — pilihan kata/rangkaian kata diacak tiap kali diproses. Biar komentar nggak monoton.

### Sintaks:
```
{pilihan1|pilihan2|pilihan3}
```

Contoh: `"Video {ini|nih|tuh} {keren|mantap|bagus} banget!"`
Bisa menghasilkan:
- "Video ini keren banget!"
- "Video nih mantap banget!"
- "Video tuh bagus banget!"

### Fungsi `processSpintax()`:
```javascript
function processSpintax(text) {
    if (!text) return "";
    const regex = /\{([^{}]+)\}/g;
    let processed = text;
    while (regex.test(processed)) {
        processed = processed.replace(regex, (match, content) => {
            const choices = content.split('|');
            return choices[Math.floor(Math.random() * choices.length)];
        });
    }
    return processed;
}
```

Fungsi ini pake **while loop** biar handle nested spintax (spintax di dalam spintax).

### Contoh Template dengan Spintax:
```
"Wah {mantap|keren|gila} {banget|parah|sih} {video|konten} {ini|nih|kali ini} 👍"
```

### Penerapan di Worker:
Spintax diproses SETELAH template dipilih dari daftar, SEBELUM masuk ke AI/sentiment pipeline.

---

## 14. Upload CSV: Format Video & Comment

**File:** `src/youtube/youtubeUpload.js`

### 14.1 Video CSV

**Endpoint:** `POST /upload/videos`

**Format kolom** (salah satu):
| `video_url` | `videoUrl` | `videoId` | `video_id` |
|---|---|---|---|
| `https://www.youtube.com/watch?v=dQw4w9WgXcQ` | sama | `dQw4w9WgXcQ` | sama |
| `https://youtu.be/dQw4w9WgXcQ` | | | |
| `https://www.youtube.com/shorts/abc123` | | | |

**Otomatis:** URL di-extract jadi videoId via `extractVideoId()` (`src/utils.js`).

Fungsi `extractVideoId()` handle format:
- YouTube watch URL: `watch?v=VIDEO_ID`
- Shorts URL: `/shorts/VIDEO_ID`
- Short URL: `youtu.be/VIDEO_ID`
- Raw video ID (11 karakter)

### 14.2 Comment CSV

**Endpoint:** `POST /upload/comments`

**Format kolom** (salah satu):
| `comment_text` | `comment` | `text` |
|---|---|---|
| `"Video ini keren banget!"` | sama | sama |
| `"Wah {mantap|keren} banget 👍"` | | |

Bisa pakai spintax di dalam comment template!

### 14.3 Sentiment CSV

**Endpoint:** `POST /upload/sentiment`

Format: file teks/CSV dengan satu sentimen per baris. Contoh:
```
positive
neutral
negative
sensitive
```

### 14.4 Sensitive Keywords CSV

**Endpoint:** `POST /upload/sensitive`

Format: CSV dengan keywords sensitif kustom. Digunakan oleh guardrail.

### Contoh CSV:

**videos.csv:**
```csv
video_url
https://www.youtube.com/watch?v=abc123
https://youtu.be/def456
https://www.youtube.com/shorts/ghi789
```

**comments.csv:**
```csv
comment_text
Video {ini|nih} {keren|mantap|bagus} banget!
{Setuju|Bener|Sepakat banget} sama {pendapat|opini} kaka
Wah {gila|mantap|keren} {banget|sih} 😎
```

---

## 15. Data Store (Penyimpanan per User)

**File:** `src/dataStore.js`

### 15.1 Struktur File:

```
data/
├── tokens.json              # YouTube OAuth refresh token (shared)
├── database.sqlite          # SQLite DB untuk auth (Sequelize)
├── sessions.sqlite          # Session store
└── <username>/
    └── store_<username>.json   # Data per user
```

### 15.2 Format Store JSON:

```json
{
  "videos": [
    {
      "url": "https://www.youtube.com/watch?v=abc123",
      "videoId": "abc123",
      "status": "pending",
      "comment": ""
    }
  ],
  "comments": [
    { "text": "Video {ini|nih} keren banget!" }
  ],
  "postingLogs": [
    {
      "runId": "RUN#1234567890",
      "videoId": "abc123",
      "comment": "video ini keren bgt!",
      "status": "success",
      "decision": { ... },
      "timestamp": "2026-07-31T..."
    }
  ]
}
```

### 15.3 Status Video:

| Status | Keterangan |
|---|---|
| `pending` | Belum diproses |
| `processing` | Lagi diproses |
| `done` | Berhasil di-post |
| `held_for_review` | Diposting tapi kena moderation |
| `error` | Gagal posting |
| `skipped_duplicate` | Dilewati karena duplikat |
| `preview` | Hasil dry-run preview |

### 15.4 Worker State (In-Memory):

Worker state disimpan di **Map** in-memory (`workerStates`), bukan di file. Ini berarti kalau server restart, state worker hilang.

```javascript
const workerStates = new Map();
// Setiap user punya state:
{
    running: false,
    stopRequested: false,
    startTime: null,
    endTime: null,
    durationMs: 0,
    limitByDuration: true
}
```

### 15.5 Fungsi-fungsi DataStore:

| Fungsi | Kegunaan |
|---|---|
| `getAll(username)` | Load semua data user |
| `saveVideos(username, videos)` | Simpan daftar video |
| `saveComments(username, comments)` | Simpan daftar komentar |
| `updateVideoStatus(username, videoId, status, comment, decision)` | Update status video + simpan decision |
| `addPostingLog(username, log)` | Simpan log posting |
| `startWorker(username, durationMs, limitByDuration)` | Set worker running |
| `stopWorker(username)` | Stop worker |
| `requestStop(username)` | Minta worker berhenti |
| `shouldStop(username)` | Cek apakah stop diminta |
| `isWorkerRunning(username)` | Cek status worker |
| `finishWorker(username)` | Reset state worker |
| `getSentimentPool(username)` | Ambil pool sentimen user |
| `setSentimentPool(username, list)` | Set pool sentimen user |
| `getSensitiveKeywords(username)` | Ambil keyword sensitif user |
| `setSensitiveKeywords(username, list)` | Set keyword sensitif user |

---

## 16. Struktur Direktori

```
youtube-auto-comment/
├── .env                          # Environment variables
├── package.json
├── README.md
├── GUIDE.md                      # ← Ini file yang kamu baca
│
├── src/
│   ├── app.js                    # Entry point, Express server
│   ├── logger.js                 # Winston logger
│   ├── utils.js                  # extractVideoId, processSpintax, dll
│   ├── dataStore.js              # JSON data store per user
│   │
│   ├── auth/
│   │   ├── authRoutes.js         # Login/register/logout routes
│   │   ├── authController.js     # Auth logic
│   │   ├── authMiddleware.js     # isAuthenticated middleware
│   │   └── youtubeAuth.js        # Google OAuth 2.0 routes
│   │
│   ├── youtube/
│   │   ├── youtubeRoutes.js      # Main router (start, stop, dry-run, dll)
│   │   ├── youtubeWorker.js      # Worker loop (jantung aplikasi)
│   │   ├── youtubeService.js     # YouTube API wrapper (postComment, fetchMetadata)
│   │   ├── youtubeUpload.js      # CSV upload handler
│   │   └── metadataHelper.js     # cleanDescription, buildCommentFromMetadata
│   │
│   ├── engines/
│   │   ├── index.js              # Engine registry (api/web/appium)
│   │   ├── apiEngine.js          # YouTube Data API v3
│   │   ├── webEngine.js          # Puppeteer (Chromium)
│   │   └── appiumEngine.js       # Appium (Android)
│   │
│   ├── ai/
│   │   └── aiCommentService.js   # OpenAI GPT comment generation
│   │
│   ├── openai/
│   │   └── openaiService.js      # Legacy OpenAI service
│   │
│   ├── db/
│   │   └── database.js           # Sequelize SQLite instance
│   │
│   └── models/
│       └── User.js               # Sequelize User model
│
├── services/
│   ├── sentimentService.js        # classifySentiment, pickRandomSentiment
│   ├── sentimentStyle.js          # applySentimentStyle (prefix per sentiment)
│   ├── guardrailService.js        # applyGuardrail (ganti komentar sensitif)
│   ├── commentEngine.js           # Legacy comment engine
│   └── aiService.js               # Legacy AI service
│
├── config/
│   ├── config.json                # Default config
│   ├── __config.json              # Alternative config (legacy)
│   ├── loadConfig.js              # Config loader
│   ├── prompts.json               # Fallback prompts (JSON)
│   └── prompts/
│       ├── rewrite_comment.txt    # Prompt AI rewrite
│       └── pure_comment.txt       # Prompt AI pure generation
│
├── routes/
│   ├── uploadSentiment.js         # Sentiment pool upload
│   └── uploadSensitive.js         # Sensitive keywords upload
│
├── public/
│   ├── index.html                 # Main dashboard
│   ├── login.html                 # Login page
│   ├── register.html              # Register page
│   ├── forgot-password.html       # Coming soon
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── main.js                # ~750 lines frontend logic
│       └── settings.js            # Settings toggles helper
│
├── data/                          # Runtime data (gitignored)
│   ├── tokens.json
│   ├── database.sqlite
│   ├── sessions.sqlite
│   └── <username>/
│       └── store_<username>.json
│
├── uploads/                       # Uploaded CSV files (gitignored)
├── puppeteer_data/               # Chromium user data (gitignored)
└── logs/                          # Winston logs (gitignored)
```

---

## 17. Cara Menjalankan

### 17.1 Development:
```bash
npm run dev
```
Menggunakan nodemon (auto-restart kalau ada perubahan).

### 17.2 Production:
```bash
npm start
# atau
node src/app.js
```

### 17.3 Standalone Auth Server (opsional):
```bash
npm run auth
```
Menjalankan server auth terpisah di port 3002 (file `src/auth.js`).

### 17.4 Langkah-langkah setelah server jalan:

1. Buka `http://localhost:3000`
2. Login dengan `admin / admin123` (atau register baru)
3. Buka `http://localhost:3000/auth` → authorize YouTube
4. Upload CSV video & comment
5. Atur toggle konfigurasi
6. Klik "Dry-Run Preview" buat test
7. Klik "Start Posting" untuk mulai

---

## Lampiran: Decision Object

Setiap kali worker memproses video, dia bikin `decision` object yang mencatat keputusan AI pipeline. Ini disimpan ke store dan ditampilkan di log.

```javascript
const decision = {
    method: "api" | "web" | "appium",
    use_context: true | false,
    sentiment_enabled: true | false,
    use_comment_ai: true | false,
    sentiment: "none" | "positive" | "neutral" | "negative" | "sensitive" | "ambiguous",
    sentimentSource: "file" | "random" | "video_context" | "fallback" | "disabled",
    sentimentMode: "random" | "analyze",
    source: "file" | "file+sentiment" | "ai_context_review+file_footer" | "rewrite_no_context" | "smart_web_callback" | "file+context" | "file+context+ai" | "file+context+ai+guardrail",
    moderationStatus: "published" | "held_for_review",
    engine_msg: "..."
};
```

---

Selamat ngoding! Semoga dengan panduan ini flow-nya jadi jelas lagi.
