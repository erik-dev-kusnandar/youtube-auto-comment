require("dotenv").config();
const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const fs = require("fs");
const path = require("path");

function getPromptContent(name) {
  const txtPath = path.join(__dirname, `../../config/prompts/${name}.txt`);
  if (fs.existsSync(txtPath)) {
    return fs.readFileSync(txtPath, "utf-8").trim();
  }

  // Fallback to JSON if txt not found
  const promptPath = path.join(__dirname, "../../config/prompts.json");
  if (fs.existsSync(promptPath)) {
    const config = JSON.parse(fs.readFileSync(promptPath, "utf-8"));
    return config[name] || "";
  }
  return "";
}

async function rewriteComment({ title, description, draft }) {
  let promptTemplate = getPromptContent("rewrite_comment");

  // If no draft is provided, use pure AI mode
  if (!draft) {
    return generatePureComment({ title, description });
  }

  if (!promptTemplate) {
    promptTemplate = `Tulis ulang jadi bahasa netizen lugas: "{{draft}}" (Konteks: {{title}})`;
  }

  // Replace placeholders
  const prompt = promptTemplate
    .replace(/{{title}}/g, title || "")
    .replace(/{{description}}/g, description?.slice(0, 300) || "")
    .replace(/{{draft}}/g, draft || "");

  const res = await client.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.9, // Slightly higher for more "lugas" variety
  });

  return res.choices[0].message.content.trim().replace(/^"|"$/g, '');
}

async function generatePureComment({ title, description }) {
  let promptTemplate = getPromptContent("pure_comment");

  if (!promptTemplate) {
    promptTemplate = `Berikan opini netizen lugas tentang video ini: {{title}} {{description}}`;
  }

  const prompt = promptTemplate
    .replace(/{{title}}/g, title || "")
    .replace(/{{description}}/g, description?.slice(0, 300) || "");

  const res = await client.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.9,
  });

  return res.choices[0].message.content.trim().replace(/^"|"$/g, '');
}

module.exports = { rewriteComment, generatePureComment };
