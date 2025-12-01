require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const uploader = require("./fileUpload");
const store = require("./dataStore");
const { postComment } = require("./youtubeService");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

let sseClients = [];
function pushLog(payload) {
  sseClients.forEach((res) =>
    res.write(`data: ${JSON.stringify(payload)}\n\n`)
  );
}

app.get("/log/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  sseClients.push(res);

  req.on("close", () => {
    sseClients = sseClients.filter((x) => x !== res);
  });
});

app.use("/upload", uploader);

app.get("/progress", (req, res) => {
  res.json(store.getAll());
});

// app.get("/start", async (req, res) => {
//     res.json({ ok: true });

//     const data = store.getAll();
//     const comments = data.comments;

//     if (comments.length === 0) {
//         pushLog({ type: "error", message: "No comments loaded!" });
//         return;
//     }

//     const commentsPerVideo = Number(req.query.count || 1); // jumlah komen / video
//     const minDelay = 60000; // 1 menit
//     const maxDelay = 180000; // 3 menit

//     for (const v of data.videos) {
//         store.updateVideoStatus(v.videoId, "processing");
//         pushLog({ type: "processing", item: v });

//         for (let i = 0; i < commentsPerVideo; i++) {
//             try {
//                 // Random comment
//                 const randomComment = comments[Math.floor(Math.random() * comments.length)].text;

//                 await postComment(v.videoId, randomComment);

//                 store.updateVideoStatus(v.videoId, "done", randomComment);

//                 pushLog({
//                     type: "done",
//                     item: v,
//                     comment: randomComment
//                 });

//                 // Random delay between posts
//                 const randomWait = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
//                 pushLog({ type: "delay", message: `Waiting ${Math.floor(randomWait / 1000)}s before next comment…` });

//                 await new Promise(r => setTimeout(r, randomWait));

//             } catch (err) {
//                 store.updateVideoStatus(v.videoId, "error");
//                 pushLog({
//                     type: "error",
//                     item: v,
//                     message: err.message
//                 });
//             }
//         }
//     }

//     pushLog({ type: "finished" });
// });

app.get("/start", async (req, res) => {
    res.json({ ok: true });

    const data = store.getAll();
    const comments = data.comments;

    if (comments.length === 0) {
        pushLog({ type: "error", message: "No comments loaded!" });
        return;
    }

    const commentsPerVideo = Number(req.query.count || 1); // jumlah komen / video
    const minDelay = 60000; // 1 menit
    const maxDelay = 180000; // 3 menit

    for (const v of data.videos) {
        store.updateVideoStatus(v.videoId, "processing");
        pushLog({ type: "processing", item: v });

        for (let i = 0; i < commentsPerVideo; i++) {
            try {
                // Random comment
                const randomComment = comments[Math.floor(Math.random() * comments.length)].text;

                await postComment(v.videoId, randomComment);

                store.updateVideoStatus(v.videoId, "done", randomComment);

                pushLog({
                    type: "done",
                    item: v,
                    comment: randomComment
                });

                // Random delay between posts
                const randomWait = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
                pushLog({ type: "delay", message: `Waiting ${Math.floor(randomWait / 1000)}s before next comment…` });

                await new Promise(r => setTimeout(r, randomWait));

            } catch (err) {
                store.updateVideoStatus(v.videoId, "error");
                pushLog({
                    type: "error",
                    item: v,
                    message: err.message
                });
            }
        }
    }

    pushLog({ type: "finished" });
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

app.listen(process.env.PORT, () =>
  console.log("Dashboard running on port", process.env.PORT)
);
