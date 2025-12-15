// src/openai/openaiService.js
require("dotenv").config();
const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function generateSmartComment({ title, description, template }) {
  const prompt = `
Buatkan komentar YouTube yang natural, ramah, relevan dengan video ini.
Gunakan gaya percakapan manusia, jangan terlalu formal.

Judul Video:
${title}

Deskripsi Video:
${description.substring(0, 500)}

Template Komentar:
${template}

Hasilkan 1 komentar relevan dan menarik.
`;

  const res = await client.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.8,
  });

  return res.choices[0].message.content.trim();
}

module.exports = { generateSmartComment };
