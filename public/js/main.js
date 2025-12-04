// // ================================
// //  Utility Toast
// // ================================
// function showToast(message, type = "info") {
//   const container = document.getElementById("toastContainer");
//   const wrapper = document.createElement("div");

//   wrapper.className = "toast align-items-center text-bg-" + type + " border-0";
//   wrapper.role = "alert";
//   wrapper.innerHTML = `
//       <div class="d-flex">
//         <div class="toast-body">${message}</div>
//         <button type="button" class="btn-close btn-close-white me-2 m-auto"
//           data-bs-dismiss="toast"></button>
//       </div>
//     `;

//   container.appendChild(wrapper);
//   const toast = new bootstrap.Toast(wrapper);
//   toast.show();
// }


// // ================================
// //  CSV UPLOAD HANDLER
// // ================================
// function handleCSVUpload(dropEl, inputEl, btnEl, msgEl, endpoint, isComment = false) {
//   let selectedFile = null;

//   dropEl.addEventListener("click", () => inputEl.click());
//   dropEl.addEventListener("dragover", (e) => { e.preventDefault(); dropEl.classList.add("drag-on"); });
//   dropEl.addEventListener("dragleave", () => dropEl.classList.remove("drag-on"));
//   dropEl.addEventListener("drop", (e) => {
//     e.preventDefault();
//     dropEl.classList.remove("drag-on");
//     selectedFile = e.dataTransfer.files[0];
//     msgEl.textContent = selectedFile?.name || "";
//   });

//   inputEl.addEventListener("change", () => {
//     selectedFile = inputEl.files[0];
//     msgEl.textContent = selectedFile?.name || "";
//   });

//   btnEl.addEventListener("click", async () => {
//     if (!selectedFile) return showToast("Please choose a CSV file", "warning");

//     const fd = new FormData();
//     fd.append("file", selectedFile);

//     try {
//       const res = await fetch(`/upload/${endpoint}`, { method: "POST", body: fd });
//       const json = await res.json();

//       msgEl.textContent = json.message;
//       showToast(json.message, "success");

//       if (isComment) {
//         // refresh preview from backend
//         const p = await fetch("/progress").then(r => r.json());
//         renderCommentPreviewBox(p.comments);
//       }

//       selectedFile = null;
//     } catch (err) {
//       showToast("Upload failed", "danger");
//     }
//   });
// }

// // async function handleCSVUpload(dropEl, inputEl, btnEl, msgEl, endpoint) {
// //   let selectedFile = null;

// //   dropEl.addEventListener("click", () => inputEl.click());

// //   dropEl.addEventListener("dragover", (e) => {
// //     e.preventDefault();
// //     dropEl.classList.add("bg-light");
// //   });

// //   dropEl.addEventListener("dragleave", () => dropEl.classList.remove("bg-light"));

// //   dropEl.addEventListener("drop", (e) => {
// //     e.preventDefault();
// //     dropEl.classList.remove("bg-light");
// //     selectedFile = e.dataTransfer.files[0];
// //     msgEl.textContent = selectedFile.name;
// //   });

// //   inputEl.addEventListener("change", () => {
// //     selectedFile = inputEl.files[0];
// //     msgEl.textContent = selectedFile?.name || "";
// //   });

// //   btnEl.addEventListener("click", async () => {
// //     if (!selectedFile) return showToast("Please choose a CSV file", "warning");

// //     const fd = new FormData();
// //     fd.append("file", selectedFile);

// //     const res = await fetch(`/upload/${endpoint}`, { method: "POST", body: fd });
// //     const json = await res.json();

// //     msgEl.textContent = json.message;
// //     showToast(json.message, "success");

// //     selectedFile = null;
// //   });
// // }

// ================================
//  COMMENT PREVIEW HANDLER
// ================================
// function renderCommentPreviewBox(list) {
//   const box = document.getElementById("commentPreviewBox");
//   box.innerHTML = "";

//   if (!list || list.length === 0) {
//     box.innerHTML = `<small class="text-muted">No comments loaded...</small>`;
//     return;
//   }

//   list.forEach((c, i) => {
//     const short = c.text.length > 40 ? c.text.substring(0, 40) + "..." : c.text;

//     const item = document.createElement("div");
//     item.className = "p-1 border-bottom";
//     item.style.cursor = "pointer";
//     item.innerHTML = `<b>${i + 1}.</b> ${short}`;

//     item.onclick = () => {
//       document.getElementById("commentDetailText").textContent = c.text;
//       new bootstrap.Modal(document.getElementById("commentModal")).show();
//     };

//     box.appendChild(item);
//   });
// }

// function showCommentDetail(text) {
//   const modalBody = document.getElementById("commentDetail");
//   modalBody.textContent = text;

//   const chars = text.length;
//   const lines = text.split("\n").length;

//   document.getElementById("commentStats").innerHTML =
//     `Characters: <b>${chars}</b> | Lines: <b>${lines}</b>`;

//   new bootstrap.Modal(document.getElementById("commentModal")).show();
// }

// // ================================
// //  BIND UPLOAD COMPONENTS
// // ================================
// handleCSVUpload(
//   document.getElementById("videosDrop"),
//   document.getElementById("videosFileInput"),
//   document.getElementById("uploadVideosBtn"),
//   document.getElementById("videosUploadMsg"),
//   "videos"
// );

// handleCSVUpload(
//   document.getElementById("commentsDrop"),
//   document.getElementById("commentsFileInput"),
//   document.getElementById("uploadCommentsBtn"),
//   document.getElementById("commentsUploadMsg"),
//   "comments",
//   true
// );


// // ================================
// //  SSE LOG STREAM
// // ================================
// const logBox = document.getElementById("logBox");
// const evt = new EventSource("/log/stream");

// evt.onmessage = (ev) => {
//   const msg = JSON.parse(ev.data);
//   logBox.textContent += `[${msg.type}] ${msg.item?.videoId || ""} ${msg.message || ""}\n`;

//   // Auto scroll to bottom
//   logBox.scrollTop = logBox.scrollHeight;
// };


// // ================================
// //  PROGRESS TABLE
// // ================================
// async function refreshProgress() {
//   const res = await fetch("/progress");
//   const json = await res.json();
//   const tbody = document.querySelector("#progressTable tbody");

//   tbody.innerHTML = "";

//   json.videos.forEach(v => {
//     tbody.innerHTML += `
//       <tr>
//         <td><a href="${v.videoUrl || "-"}" target="_blank">${v.videoUrl}</a></td>
//         <td>${v.videoId}</td>
//         <td>${v.status}</td>
//         <td>${v.comment || ""}</td>
//       </tr>`;
//   });
// }


// document.getElementById("refreshBtn").onclick = refreshProgress;
// refreshProgress();
// setInterval(refreshProgress, 5000);


// // ================================
// //  START / STOP
// // ================================
// document.getElementById("startBtn").onclick = () => {
//   fetch("/start");

//   startBtn.addEventListener("click", async () => {
//     const count = document.getElementById("commentsPerVideo").value;
//     fetch(`/start?count=${count}`);
//   });


//   showToast("Posting started 🚀", "primary");
// };

// document.getElementById("stopBtn").onclick = () => {
//   showToast("Stopped (UI only)", "secondary");
// };


// // ================================
// //  Clear Log
// // ================================
// document.getElementById("clearLog").onclick = () => (logBox.textContent = "");

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
    (json.videos || []).forEach(v => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
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
      li.textContent = `${idx+1}. ${c.text}`;
      list.appendChild(li);
    });
  } catch (e) {
    console.error(e);
  }
}
loadCommentPreview();

// START / STOP handlers
document.getElementById("startBtn").addEventListener("click", async () => {
  const count = document.getElementById("commentsPerVideo").value || 1;
  const delayMs = document.getElementById("delayPerComment").value || 3000;
  
  try {
    const res = await fetch(`/start?count=${count}&delayMs=${delayMs}`);
    const js = await res.json();
    showToast("Posting started 🚀", "primary");
  } catch (e) {
    showToast("Failed to start", "danger");
  }
});

document.getElementById("stopBtn").addEventListener("click", () => {
  showToast("Stopped (UI only)", "secondary");
});

document.getElementById("clearLog").addEventListener("click", () => {
  logBox.textContent = "";
});
