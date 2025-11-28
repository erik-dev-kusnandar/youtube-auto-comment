// ===== Helper =====
async function uploadCSV(formId, endpoint, statusEl) {
    const form = document.getElementById(formId);
    const status = document.getElementById(statusEl);

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const formData = new FormData(form);

        status.innerHTML = "Uploading... ⏳";

        const res = await fetch(endpoint, {
            method: "POST",
            body: formData
        });

        const json = await res.json();
        status.innerHTML = json.message;

        // Refresh progress table setelah upload
        loadProgress();
    });
}

// Activate upload handlers
uploadCSV("uploadVideosForm", "/upload/videos", "videoUploadStatus");
uploadCSV("uploadCommentsForm", "/upload/comments", "commentUploadStatus");


// ===== Progress Table =====
async function loadProgress() {
    const res = await fetch("/progress");
    const data = await res.json();

    const tbody = document.querySelector("#progressTable tbody");
    tbody.innerHTML = "";

    data.videos.forEach(v => {
        const row = `
            <tr>
                <td>${v.url}</td>
                <td>${v.videoId}</td>
                <td>${v.status}</td>
                <td>${v.comment || ""}</td>
            </tr>
        `;
        tbody.insertAdjacentHTML("beforeend", row);
    });
}

document.getElementById("refreshBtn").addEventListener("click", loadProgress);


// ===== SSE Live Log =====
function connectLogStream() {
    const logBox = document.getElementById("logBox");
    const evt = new EventSource("/log/stream");

    evt.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        logBox.innerHTML += `[${msg.type}] ${msg.item?.videoId || ""} ${msg.message || ""}<br>`;
        logBox.scrollTop = logBox.scrollHeight;
        loadProgress(); // update table realtime
    };
}

connectLogStream();


// ===== Start Comment Posting =====
document.getElementById("startBtn").addEventListener("click", async () => {
    await fetch("/start");
    alert("🚀 Auto-comment started! Check logs.");
});
