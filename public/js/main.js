// ================================
//  Utility Toast
// ================================
function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  const wrapper = document.createElement("div");

  wrapper.className = "toast align-items-center text-bg-" + type + " border-0";
  wrapper.role = "alert";
  wrapper.innerHTML = `
      <div class="d-flex">
        <div class="toast-body">${message}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto"
          data-bs-dismiss="toast"></button>
      </div>
    `;

  container.appendChild(wrapper);
  const toast = new bootstrap.Toast(wrapper);
  toast.show();
}


// ================================
//  CSV UPLOAD HANDLER
// ================================
function handleCSVUpload(dropEl, inputEl, btnEl, msgEl, endpoint, isComment = false) {
  let selectedFile = null;

  dropEl.addEventListener("click", () => inputEl.click());
  dropEl.addEventListener("dragover", (e) => { e.preventDefault(); dropEl.classList.add("drag-on"); });
  dropEl.addEventListener("dragleave", () => dropEl.classList.remove("drag-on"));
  dropEl.addEventListener("drop", (e) => {
    e.preventDefault();
    dropEl.classList.remove("drag-on");
    selectedFile = e.dataTransfer.files[0];
    msgEl.textContent = selectedFile?.name || "";
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
      const res = await fetch(`/upload/${endpoint}`, { method: "POST", body: fd });
      const json = await res.json();

      msgEl.textContent = json.message;
      showToast(json.message, "success");

      if (isComment) {
        // refresh preview from backend
        const p = await fetch("/progress").then(r => r.json());
        renderCommentPreviewBox(p.comments);
      }

      selectedFile = null;
    } catch (err) {
      showToast("Upload failed", "danger");
    }
  });
}

// async function handleCSVUpload(dropEl, inputEl, btnEl, msgEl, endpoint) {
//   let selectedFile = null;

//   dropEl.addEventListener("click", () => inputEl.click());

//   dropEl.addEventListener("dragover", (e) => {
//     e.preventDefault();
//     dropEl.classList.add("bg-light");
//   });

//   dropEl.addEventListener("dragleave", () => dropEl.classList.remove("bg-light"));

//   dropEl.addEventListener("drop", (e) => {
//     e.preventDefault();
//     dropEl.classList.remove("bg-light");
//     selectedFile = e.dataTransfer.files[0];
//     msgEl.textContent = selectedFile.name;
//   });

//   inputEl.addEventListener("change", () => {
//     selectedFile = inputEl.files[0];
//     msgEl.textContent = selectedFile?.name || "";
//   });

//   btnEl.addEventListener("click", async () => {
//     if (!selectedFile) return showToast("Please choose a CSV file", "warning");

//     const fd = new FormData();
//     fd.append("file", selectedFile);

//     const res = await fetch(`/upload/${endpoint}`, { method: "POST", body: fd });
//     const json = await res.json();

//     msgEl.textContent = json.message;
//     showToast(json.message, "success");

//     selectedFile = null;
//   });
// }

// ================================
//  COMMENT PREVIEW HANDLER
// ================================
function renderCommentPreviewBox(list) {
  const box = document.getElementById("commentPreviewBox");
  box.innerHTML = "";

  if (!list || list.length === 0) {
    box.innerHTML = `<small class="text-muted">No comments loaded...</small>`;
    return;
  }

  list.forEach((c, i) => {
    const short = c.text.length > 40 ? c.text.substring(0, 40) + "..." : c.text;

    const item = document.createElement("div");
    item.className = "p-1 border-bottom";
    item.style.cursor = "pointer";
    item.innerHTML = `<b>${i + 1}.</b> ${short}`;

    item.onclick = () => {
      document.getElementById("commentDetailText").textContent = c.text;
      new bootstrap.Modal(document.getElementById("commentModal")).show();
    };

    box.appendChild(item);
  });
}

// ================================
//  BIND UPLOAD COMPONENTS
// ================================
handleCSVUpload(
  document.getElementById("videosDrop"),
  document.getElementById("videosFileInput"),
  document.getElementById("uploadVideosBtn"),
  document.getElementById("videosUploadMsg"),
  "videos"
);

handleCSVUpload(
  document.getElementById("commentsDrop"),
  document.getElementById("commentsFileInput"),
  document.getElementById("uploadCommentsBtn"),
  document.getElementById("commentsUploadMsg"),
  "comments",
  true
);


// ================================
//  SSE LOG STREAM
// ================================
const logBox = document.getElementById("logBox");
const evt = new EventSource("/log/stream");

evt.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  logBox.textContent += `[${msg.type}] ${msg.item?.videoId || ""} ${msg.message || ""}\n`;

  // Auto scroll to bottom
  logBox.scrollTop = logBox.scrollHeight;
};


// ================================
//  PROGRESS TABLE
// ================================
async function refreshProgress() {
  const res = await fetch("/progress");
  const json = await res.json();
  const tbody = document.querySelector("#progressTable tbody");

  tbody.innerHTML = "";

  json.videos.forEach(v => {
    tbody.innerHTML += `
      <tr>
        <td><a href="${v.videoUrl || "-"}" target="_blank">${v.videoUrl}</a></td>
        <td>${v.videoId}</td>
        <td>${v.status}</td>
        <td>${v.comment || ""}</td>
      </tr>`;
  });
}


document.getElementById("refreshBtn").onclick = refreshProgress;
refreshProgress();
setInterval(refreshProgress, 5000);


// ================================
//  START / STOP
// ================================
document.getElementById("startBtn").onclick = () => {
  fetch("/start");

  startBtn.addEventListener("click", async () => {
    const count = document.getElementById("commentsPerVideo").value;
    fetch(`/start?count=${count}`);
  });


  showToast("Posting started 🚀", "primary");
};

document.getElementById("stopBtn").onclick = () => {
  showToast("Stopped (UI only)", "secondary");
};


// ================================
//  Clear Log
// ================================
document.getElementById("clearLog").onclick = () => (logBox.textContent = "");
