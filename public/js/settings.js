function saveSettings() {
  const payload = {
    comment_engine: {
      use_context_ai: document.getElementById("toggleContextAI").checked,
      use_comment_ai: document.getElementById("toggleCommentAI").checked,
    }
  };

  fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

function saveCommentSettings() {
  const payload = {
    use_context: document.getElementById("toggleContextAI").checked,
    use_comment_ai: document.getElementById("toggleCommentAI").checked
  };

  fetch("/settings/comment-flow", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

function syncSentimentToggle() {
  // const contextToggle = document.getElementById("toggleContextAI");
  // const sentimentToggle = document.getElementById("toggleSentiment");

  // if (!contextToggle.checked) {
  //   sentimentToggle.checked = false;
  //   sentimentToggle.disabled = true;
  // } else {
  //   sentimentToggle.disabled = false;
  // }
  return;
}

document.addEventListener("DOMContentLoaded", () => {
  // syncSentimentToggle();
});

document.getElementById("toggleContextAI")
  .addEventListener("change", () => {
    // syncSentimentToggle();
    saveCommentSettings();
  });

["toggleCommentAI"]
  .forEach(id => {
    document.getElementById(id)
      .addEventListener("change", saveCommentSettings);
  });