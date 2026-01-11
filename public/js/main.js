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

// main.js - GANTI BAGIAN SSE
const MAX_LOG_LINES = 100; // ✅ KURANGI DARI 500 KE 100
const logLines = [];

function connectSSE() {
  try {
    evt = new EventSource("/log/stream");
    evt.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      const time = new Date().toLocaleTimeString();
      const rid = msg.runId ? `[${msg.runId.substring(0, 10)}] ` : "";

      let line = "";

      if (msg.type === "video") {
        const d = msg.message?.decision || {};

        // 🔍 DEBUG: Log what we receive from backend
        console.log("🔍 FRONTEND received decision:", JSON.stringify(d, null, 2));

        const sentimentInfo = d.sentiment_enabled
          ? ` | Sentiment Mode=${d.sentimentMode || "none"} (${d.sentimentSource || "unknown"})`
          : "";
        const moderationStatus = msg.message?.moderationStatus || "unknown";
        const statusIcon = moderationStatus === "published" ? "✅" :
          (moderationStatus === "held_for_review" || moderationStatus === "heldForReview") ? "⚠️" : "❓";
        line = `[${time}] ${rid}[VIDEO] ${msg.item?.videoId || ""}
 ├─ Pakai Context AI=${d.use_context ? "ON" : "OFF"} | Aktifkan Sentiment=${d.sentiment_enabled ? "ON" : "OFF"}${sentimentInfo} | Komen Pakai AI=${d.use_comment_ai ? "ON" : "OFF"}
 ├─ Status: ${statusIcon} ${moderationStatus}
 └─ ${(msg.message?.preview || "").substring(0, 80)}...`;
      } else if (msg.type === "config") {
        line = `[${time}] ${rid}[CONFIG] ${msg.message}`;
      } else if (msg.type === "delay") {
        line = `[${time}] ${rid}[DELAY] ${msg.message}`;
      } else if (msg.type === "finished") {
        line = `[${time}] ${rid}[✓ FINISHED] ${msg.message}`;
      } else {
        line = `[${time}] ${rid}[${msg.type.toUpperCase()}] ${msg.message || ""}`;
      }

      if (line) {
        logLines.push(line);

        // ✅ KEEP ONLY LAST 100 LINES
        while (logLines.length > MAX_LOG_LINES) {
          logLines.shift();
        }

        logBox.textContent = logLines.join("\n");
        logBox.scrollTop = logBox.scrollHeight;
      }
    };

    evt.onerror = () => {
      console.warn("SSE error");
      evt.close();
      setTimeout(connectSSE, 3000);
    };
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
        <td>
          ${renderStatus(v)}
        </td>
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

// export to CSV
async function exportToCSV() {
  try {
    const res = await fetch("/progress");
    if (!res.ok) throw new Error("Failed to fetch progress");
    const json = await res.json();
    const videos = json.videos || [];

    if (videos.length === 0) {
      showToast("No data to export", "warning");
      return;
    }

    // Prepare data for CSV
    const data = videos.map((v, index) => ({
      "#": index + 1,
      "Video URL": v.url,
      "Video ID": v.videoId,
      "Status": v.status,
      "Comment": v.comment
    }));

    // Generate CSV using PapaParse (already in dependencies)
    const csv = Papa.unparse(data);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `youtube_comment_results_${new Date().getTime()}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast("Export successful!", "success");
  } catch (err) {
    console.error(err);
    showToast("Export failed", "danger");
  }
}

document.getElementById("exportBtn").addEventListener("click", exportToCSV);

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
      const workerStatusDiv = document.getElementById("workerStatus");
      const countdownLabel = workerStatusDiv.querySelector("br").previousSibling; // Node before <br>

      if (state.limitByDuration) {
        countdownLabel.textContent = "⏳ Auto posting berjalan…";
        document.getElementById("countdown").parentElement.previousElementSibling.textContent = "Sisa waktu: ";
        countdownEl.textContent = formatMs(state.remainingMs);
      } else {
        countdownLabel.textContent = "📑 Mode: List Video (Sekali Jalan)";
        document.getElementById("countdown").parentElement.previousElementSibling.textContent = "Status: ";
        countdownEl.textContent = "Berjalan sampai list habis";
      }

      statusBox.style.display = "block";
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
    document.getElementById("postingDuration").value || 3600000
  );

  const minDelay = Number(
    document.getElementById("minDelayPerComment").value || 300000
  );

  const maxDelay = Number(
    document.getElementById("maxDelayPerComment").value || 600000
  );

  const method = document.getElementById("postingMethod").value;
  const deviceId = document.getElementById("deviceId").value;
  const runId = "RUN#" + Date.now();

  const payload = {
    postingDuration,
    minDelay,
    maxDelay,
    runId,
    method,
    deviceId,
    flowConfig: {
      use_context: document.getElementById("toggleContextAI").checked,
      use_comment_ai: document.getElementById("toggleCommentAI").checked,
      sentiment: {
        enabled: document.getElementById("toggleSentimentEnable").checked,
        mode: document.getElementById("sentimentMode").value
      },
      ai_mode: document.getElementById("aiMode").value
    },
    limitByDuration: document.getElementById("limitByDuration").checked,
    headless: document.getElementById("headlessMode").checked,
    browserPath: document.getElementById("browserPath").value
  };

  console.log("Starting posting with payload:", payload);

  try {
    const res = await fetch("/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
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

const dryRunBtn = document.getElementById("dryRunBtn");

dryRunBtn.addEventListener("click", async () => {
  console.log("🔥 DRY-RUN HIT");

  const runId = generateRunId();

  try {
    showToast("Running dry-run preview…", "info");

    const payload = {
      runId,
      flowConfig: {
        use_context: document.getElementById("toggleContextAI").checked,
        use_comment_ai: document.getElementById("toggleCommentAI").checked,
        sentiment: {
          enabled: document.getElementById("toggleSentimentEnable").checked,
          mode: document.getElementById("sentimentMode").value
        },
        ai_mode: document.getElementById("aiMode").value
      }
    };

    console.log("Dry-run payload:", payload);

    const res = await fetch("/dry-run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const json = await res.json();
    if (!json.ok) {
      showToast(json.message || "Dry-run failed", "danger");
      return;
    }

    showToast(`Dry-run selesai (${json.total} video)`, "success");
    await refreshProgress();

  } catch (e) {
    showToast("Dry-run error", "danger");
  }
});

function renderStatus(v) {
  if (!v.status) return "";

  let badgeClass = "badge bg-secondary";
  if (v.status === "done") badgeClass = "badge bg-success";
  else if (v.status === "processing") badgeClass = "badge bg-info text-dark";
  else if (v.status === "error") badgeClass = "badge bg-danger";
  else if (v.status === "held_for_review") badgeClass = "badge bg-warning text-dark";

  let html = `<div><span class="${badgeClass}">${v.status}</span></div>`;

  if (v.decision) {
    const d = v.decision;

    const context = d.use_context ? "ON" : "OFF";
    const ai = d.use_comment_ai ? "ON" : "OFF";

    const contextBadge = d.use_context ? "bg-success" : "bg-secondary";
    const aiBadge = d.use_comment_ai ? "bg-primary" : "bg-secondary";

    html += `
    <span class="badge ${contextBadge} me-1">context:${context}</span>
    <span class="badge ${aiBadge} me-1">ai:${ai}</span>
    ${sentimentBadge(d.sentiment)}
  `;

    if (d.source) {
      html += `
      <div class="text-muted" style="font-size:11px;">
        ${d.source}
      </div>
    `;
    }
  }

  return html;
}

function sentimentBadge(sentiment) {
  if (!sentiment) return "";

  const map = {
    positive: "bg-success",
    neutral: "bg-secondary",
    negative: "bg-danger",
    sensitive: "bg-warning text-dark",
    ambiguous: "bg-info"
  };

  const cls = map[sentiment] || "bg-secondary";
  return `<span class="badge ${cls} me-1">sentiment:${sentiment}</span>`;
}

function runDryRun() {
  const payload = {
    flowConfig: {
      use_context: document.getElementById("toggleContextAI").checked,
      use_comment_ai: document.getElementById("toggleCommentAI").checked
    }
  };

  fetch("/dry-run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

function generateRunId() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `RUN#${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

const toggleSentimentEnable = document.getElementById("toggleSentimentEnable");
const sentimentMode = document.getElementById("sentimentMode");

toggleSentimentEnable.addEventListener("change", () => {
  sentimentMode.disabled = !toggleSentimentEnable.checked;
});

function renderSentimentPool(list) {
  const box = document.getElementById("sentimentPoolPreview");
  box.innerHTML = "Sentiment pool: " + list.join(", ");
}

const uploadSentimentBtn = document.getElementById("uploadSentimentBtn");

if (uploadSentimentBtn) {
  uploadSentimentBtn.addEventListener("click", async () => {
    const fileInput = document.getElementById("sentimentFile");

    if (!fileInput || !fileInput.files.length) {
      alert("Pilih file sentiment dulu");
      return;
    }

    const fd = new FormData();
    fd.append("file", fileInput.files[0]);

    const res = await fetch("/upload/sentiment", {
      method: "POST",
      body: fd
    });

    const json = await res.json();

    if (json.ok) {
      console.log("Sentiment uploaded:", json.pool);
      renderSentimentPool(json.pool);
    } else {
      alert("Upload sentiment gagal");
    }
  });
}



function sentimentBadge(s) {
  const map = {
    positive: "🟢",
    negative: "🔴",
    neutral: "⚪",
    sensitive: "⚠️",
    ambiguous: "🟡"
  };
  return map[s] || "—";
}
// ===== USER PROFILE MANAGEMENT =====
async function fetchUserProfile() {
  try {
    const res = await fetch("/me");
    if (res.ok) {
      const user = await res.json();
      document.getElementById("userNameDisplay").textContent = user.username;

      // Pre-fill modal
      document.getElementById("profileUsername").value = user.username;
      document.getElementById("profileEmail").value = user.email;
    } else {
      // If unauthorized, redirect to login
      window.location.href = "/login";
    }
  } catch (err) {
    console.error("Failed to fetch user profile", err);
  }
}

document.getElementById("logoutBtn").addEventListener("click", async (e) => {
  e.preventDefault();
  try {
    await fetch("/logout", { method: "POST" });
    window.location.href = "/login";
  } catch (err) {
    console.error("Logout failed", err);
  }
});

document.getElementById("profileForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  const data = Object.fromEntries(formData.entries());

  try {
    const res = await fetch("/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    const result = await res.json();
    if (res.ok) {
      showToast("Profile updated successfully ✅", "success");
      // Close modal
      const modal = bootstrap.Modal.getInstance(document.getElementById("profileModal"));
      modal.hide();
      // Refresh user info
      fetchUserProfile();
    } else {
      showToast(result.error || "Failed to update profile", "danger");
    }
  } catch (err) {
    showToast("Error updating profile", "danger");
  }
});

// ===== POSTING METHOD SELECTION =====
const postingMethod = document.getElementById("postingMethod");
const webSettings = document.getElementById("webSettings");
const openWebLoginBtn = document.getElementById("openWebLoginBtn");
const appiumSettings = document.getElementById("appiumSettings");
const testConnBtn = document.getElementById("testConnBtn");
const connectionStatus = document.getElementById("connectionStatus");
const deviceIdInput = document.getElementById("deviceId");

postingMethod.addEventListener("change", () => {
  const val = postingMethod.value;
  if (val === "appium") {
    appiumSettings.style.display = "block";
    webSettings.style.display = "none";
    checkAppiumConnectionState();
  } else if (val === "web") {
    appiumSettings.style.display = "none";
    webSettings.style.display = "block";
    startBtn.disabled = false;
  } else {
    appiumSettings.style.display = "none";
    webSettings.style.display = "none";
    unlockUIForAPI();
  }
});

openWebLoginBtn.addEventListener("click", async () => {
  openWebLoginBtn.disabled = true;
  openWebLoginBtn.textContent = "⌛ Opening Browser...";
  const browserPath = document.getElementById("browserPath").value;
  try {
    const res = await fetch("/web/setup-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ browserPath })
    });
    const json = await res.json();
    if (json.ok) {
      showToast("Browser opened! Please login to YouTube.", "success");
    } else {
      showToast(json.message || "Failed to open browser", "danger");
    }
  } catch (e) {
    showToast("Error connecting to server", "danger");
  } finally {
    openWebLoginBtn.disabled = false;
    openWebLoginBtn.textContent = "🔓 Open Browser (Setup Login)";
  }
});

testConnBtn.addEventListener("click", async () => {
  const deviceId = deviceIdInput.value;
  if (!deviceId) return showToast("Please enter a device ID", "warning");

  connectionStatus.textContent = "Testing...";
  connectionStatus.className = "badge bg-warning text-dark";
  testConnBtn.disabled = true;

  try {
    const res = await fetch("/appium/test-connection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId })
    });
    const json = await res.json();

    if (json.ok) {
      connectionStatus.textContent = "Connected";
      connectionStatus.className = "badge bg-success";
      startBtn.disabled = false;
      showToast("Device connected successfully! 🎉", "success");
    } else {
      connectionStatus.textContent = "Failed";
      connectionStatus.className = "badge bg-danger";
      startBtn.disabled = true;
      showToast("Connection failed. Check Appium Server and ADB.", "danger");
    }
  } catch (e) {
    connectionStatus.textContent = "Error";
    connectionStatus.className = "badge bg-danger";
    startBtn.disabled = true;
    showToast("Error testing connection", "danger");
  } finally {
    testConnBtn.disabled = false;
  }
});

function unlockUIForAPI() {
  startBtn.disabled = false;
  connectionStatus.className = "badge bg-secondary";
  connectionStatus.textContent = "N/A (API Mode)";
}

function checkAppiumConnectionState() {
  if (connectionStatus.textContent !== "Connected") {
    startBtn.disabled = true;
  } else {
    startBtn.disabled = false;
  }
}

// Load user profile on startup
document.addEventListener("DOMContentLoaded", () => {
  // Initialize UI state
  postingMethod.dispatchEvent(new Event('change'));

  // Toggle AI Mode Container
  const toggleCommentAI = document.getElementById("toggleCommentAI");
  const aiModeContainer = document.getElementById("aiModeContainer");
  toggleCommentAI.addEventListener("change", () => {
    aiModeContainer.style.display = toggleCommentAI.checked ? "block" : "none";
  });

  // Toggle Duration Input
  const limitByDuration = document.getElementById("limitByDuration");
  const durationInputContainer = document.getElementById("durationInputContainer");
  limitByDuration.addEventListener("change", () => {
    if (limitByDuration.checked) {
      durationInputContainer.style.opacity = "1";
      document.getElementById("postingDuration").disabled = false;
    } else {
      durationInputContainer.style.opacity = "0.5";
      document.getElementById("postingDuration").disabled = true;
    }
  });
});
