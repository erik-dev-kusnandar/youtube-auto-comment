require("dotenv").config();
const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function rewriteComment({ title, description, draft }) {
  const prompt = `
Anda adalah pengguna YouTube asli yang menulis komentar singkat dan natural.

ATURAN KETAT (WAJIB):
- Maksimal 2 kalimat
- Jangan promosi
- Jangan CTA (subscribe, follow, like, dll)
- Jangan hashtag
- Jangan emoji berlebihan (maks 1)
- Bahasa santai & manusiawi
- Fokus ke isi video, bukan channel

Judul Video:
${title}

Ringkasan Konteks Video:
${description}

Draft Komentar:
"${draft}"

Tulis ulang komentar agar terdengar alami seperti manusia.
`;

  const res = await client.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
  });

  return res.choices[0].message.content.trim();
}

module.exports = { rewriteComment };
