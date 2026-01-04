require("dotenv").config();
const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function rewriteComment({ title, description, draft }) {
  const prompt = `
Anda adalah pengguna YouTube asli yang sedang menonton video. 
Tulis ulang komentar (draft) di bawah agar terdengar sangat alami, santai, dan seperti opini manusia sungguhan.

Konteks Video:
Judul: ${title}
Deskripsi: ${description?.slice(0, 300)}

Draft Awal: "${draft}"

ATURAN KETAT:
1. Maksimal 2 kalimat pendek.
2. Gunakan bahasa gaul/santai (seperti: "sih", "banget", "nih", "ya").
3. Jangan pakai hashtag, jangan promosi, jangan minta subscribe.
4. Jangan terlalu kaku/formal.
5. Variasikan struktur kalimat agar tidak selalu sama.
6. Maksimal 1 emoji yang relevan.

Tulis ulang sekarang:
`;

  const res = await client.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [{ role: "user", content: prompt }],
    // ✅ [IMPROVEMENT] Higher temperature (0.85) for more creative & varied output
    // helps avoid repetitive phrasing which YouTube's spam filters often flag.
    temperature: 0.85,
  });

  // ✅ [FIX] Clean up AI output by removing potential leading/trailing quotes
  return res.choices[0].message.content.trim().replace(/^"|"$/g, '');
}

module.exports = { rewriteComment };
