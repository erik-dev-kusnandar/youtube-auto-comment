// public/js/main.js

// utility toast (uses bootstrap)
function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  const wrapper = document.createElement("div");
  wrapper.className = "toast align-items-center text-bg-" + (type === "info" ? "secondary" : type) + " border-0 mb-2";
  wrapper.role = "alert";
  wrapper.innerHTML = `<div class="d-flex"><div class="toast-body">${message}</div><button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div>`;
  container.appendChild(wrapper);
  const t = new bootstrap.Toast(wrapper);
  t.show();
  setTimeout(() => wrapper.remove(), 8000);
}

// CSV drop/upload handler
async function handleCSVUpload(dropEl, inputEl, btnEl, msgEl, endpoint, onLoaded) {
  let selectedFile = null;

  dropEl.addEventListener("click", () => inputEl.click());
  dropEl.addEventListener("dragover", (e) => { e.preventDefault(); dropEl.classList.add("bg-light"); });
  dropEl.addEventListener("dragleave", () => dropEl.classList.remove("bg-light"));
  dropEl.addEventListener("drop", (e) => {
    e.preventDefault(); dropEl.classList.remove("bg-light");
    selectedFile = e.dataTransfer.files[0];
    msgEl.textContent = selectedFile.name;
  });

  inputEl.addEventListener("change", () => {
    selectedFile = inputEl.files[0];
    msgEl.textContent = selectedFile?.name || "";
  });

  btnEl.addEventListener("click", async () => {
    if (!selectedFile) return showToast("Please choose a CSV file", "warning");
    const fd = new FormData();
    fd.append("file", selectedFile);
    try {
      showToast("Uploading…", "info");
      const res = await fetch(`/upload/${endpoint}`, { method: "POST", body: fd });
      const json = await res.json();
      msgEl.textContent = json.message;
      showToast(json.message, "success");
      selectedFile = null;
      if (onLoaded) onLoaded();
    } catch (err) {
      showToast("Upload failed", "danger");
    }
  });
}

// bind uploads
handleCSVUpload(
  document.getElementById("videosDrop"),
  document.getElementById("videosFileInput"),
  document.getElementById("uploadVideosBtn"),
  document.getElementById("videosUploadMsg"),
  "videos",
  refreshProgress
);

handleCSVUpload(
  document.getElementById("commentsDrop"),
  document.getElementById("commentsFileInput"),
  document.getElementById("uploadCommentsBtn"),
  document.getElementById("commentsUploadMsg"),
  "comments",
  async () => {
    showToast("Comments uploaded, refreshing preview", "info");
    await loadCommentPreview();
  }
);

// SSE log stream + auto-scroll
const logBox = document.getElementById("logBox");
let evt;
function connectSSE() {
  try {
    evt = new EventSource("/log/stream");
    evt.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      const text = `[${new Date().toLocaleTimeString()}] [${msg.type}] ${msg.item?.videoId || ""} ${msg.message || ""}\n`;
      logBox.textContent += text;
      logBox.scrollTop = logBox.scrollHeight; // auto-scroll
    };
    evt.onerror = () => { console.warn("SSE error"); evt.close(); setTimeout(connectSSE, 3000); };
  } catch (e) {
    console.error("SSE connect failed", e);
  }
}
connectSSE();

// refresh progress table
async function refreshProgress() {
  try {
    const res = await fetch("/progress");
    if (!res.ok) throw new Error("no progress");
    const json = await res.json();
    const tbody = document.getElementById("progressTable");
    tbody.innerHTML = "";
    (json.videos || []).forEach((v, index) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${index + 1}</td>
        <td><a href="${v.url || '#'}" target="_blank">${v.url || '-'}</a></td>
        <td>${v.videoId || ''}</td>
        <td>${v.status || ''}</td>
        <td>${v.comment || ''}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    // ignore
  }
}

setInterval(checkStatus, 2000);

async function checkStatus() {
  const res = await fetch("/status");
  const data = await res.json();

  if (data.running) {
    lockUI(true);
    updateCountdown(data.remainingMs);
  } else {
    lockUI(false);
    updateCountdown(0);
  }
}

function lockUI(isRunning) {
  document.getElementById("startBtn").disabled = isRunning;
  document.getElementById("uploadVideosBtn").disabled = isRunning;
  document.getElementById("uploadCommentsBtn").disabled = isRunning;
}

document.getElementById("refreshBtn").addEventListener("click", refreshProgress);
refreshProgress();
setInterval(refreshProgress, 5000);

// comment preview loader
async function loadCommentPreview() {
  try {
    const res = await fetch("/progress"); // comments are stored server-side in same store
    const json = await res.json();
    // We can't read CSV directly from server; server saved comments in data store
    // but /progress returns videos+comments if coded accordingly. If not, we fetch /progress then request comments via /progress.comments
    // We'll attempt to read json.comments
    const comments = json.comments || [];
    const list = document.getElementById("commentPreview");
    list.innerHTML = "";
    if (!comments.length) {
      const li = document.createElement("li");
      li.className = "list-group-item";
      li.textContent = "No comments loaded...";
      list.appendChild(li);
      return;
    }
    comments.forEach((c, idx) => {
      const li = document.createElement("li");
      li.className = "list-group-item";
      li.textContent = `${idx + 1}. ${c.text}`;
      list.appendChild(li);
    });
  } catch (e) {
    console.error(e);
  }
}

loadCommentPreview();

// START / STOP handlers
// document.getElementById("startBtn").addEventListener("click", async () => {

//   const postingDuration = Number(
//     document.getElementById("postingDuration").value || 120000
//   );

//   const minDelay = Number(
//     document.getElementById("minDelayPerComment").value || 30000
//   );

//   const maxDelay = Number(
//     document.getElementById("maxDelayPerComment").value || 60000
//   );

//   const params = new URLSearchParams({
//     postingDuration,
//     minDelay,
//     maxDelay,
//   });


//   try {
//     const res = await fetch(`/start?${params.toString()}`);
//     const json = await res.json();

//     console.log("START RESPONSE:", json);

//     showToast("Posting started 🚀", "primary");
//   } catch (e) {
//     showToast("Failed to start", "danger");
//   }
// });

// document.getElementById("stopBtn").addEventListener("click", () => {
//   showToast("Stopped (UI only)", "secondary");
// });

document.getElementById("clearLog").addEventListener("click", () => {
  logBox.textContent = "";
});

function updateCountdown(ms) {
  if (ms <= 0) {
    document.getElementById("countdown").innerText = "--:--";
    return;
  }

  const totalSeconds = Math.floor(ms / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");

  document.getElementById("countdown").innerText = `${minutes}:${seconds}`;
}

const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const statusBox = document.getElementById("workerStatus");
const countdownEl = document.getElementById("countdown");

function formatMs(ms) {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r}s`;
}

async function pollWorkerStatus() {
  try {
    const res = await fetch("/status");
    const state = await res.json();

    if (state.running) {
      // 🔒 Lock UI
      startBtn.disabled = true;
      stopBtn.disabled = false;
      statusBox.style.display = "block";

      countdownEl.textContent = formatMs(state.remainingMs);
    } else {
      // 🔓 Unlock UI
      startBtn.disabled = false;
      stopBtn.disabled = true;
      statusBox.style.display = "none";
    }
  } catch (e) {
    console.error("Status error", e);
  }
}
setInterval(pollWorkerStatus, 1000);
pollWorkerStatus();

startBtn.addEventListener("click", async () => {
  // Start worker
  startBtn.disabled = true;
  stopBtn.disabled = false;

  const postingDuration = Number(
    document.getElementById("postingDuration").value || 120000
  );

  const minDelay = Number(
    document.getElementById("minDelayPerComment").value || 30000
  );

  const maxDelay = Number(
    document.getElementById("maxDelayPerComment").value || 60000
  );

  const params = new URLSearchParams({
    postingDuration,
    minDelay,
    maxDelay,
  });

  try {
    const res = await fetch(`/start?${params.toString()}`);
    const json = await res.json();

    console.log("START RESPONSE:", json);

    showToast("Posting started 🚀", "primary");
  } catch (e) {
    showToast("Failed to start", "danger");
  }
});

stopBtn.addEventListener("click", async () => {
  await fetch("/stop", { method: "POST" });
  await pollWorkerStatus();
});
