const { rewriteComment, generatePureComment } = require("../src/ai/aiCommentService");

async function test() {
    const samples = [
        {
            title: "PURBAYA SENTIL Perusahaan Batu Bara yang Protes soal Pengenaan Bea Keluar",
            description: "Menteri Keuangan Purbaya Yudhi menyindir para perusahaan batu bara yang tengah melakukan protes...",
            draft: "Semangat Pak Purbaya, usut tuntas korupsi batu bara."
        },
        {
            title: "Review iPhone 15 Pro Max Setelah 1 Bulan",
            description: "Apakah worth it upgrade ke iPhone 15 Pro Max? Simak review lengkapnya.",
            draft: "Bagus reviewnya mas, sangat membantu."
        }
    ];

    console.log("=== TESTING REFINED REWRITE (WITH DRAFT) ===\n");
    for (const sample of samples) {
        console.log(`Judul: ${sample.title}`);
        console.log(`Draft: ${sample.draft}`);
        const result = await rewriteComment(sample);
        console.log(`AI Rewrite: ${result}`);
        console.log("-----------------------------------\n");
    }

    console.log("\n=== TESTING PURE AI (WITHOUT DRAFT) ===\n");
    for (const sample of samples) {
        console.log(`Judul: ${sample.title}`);
        const result = await generatePureComment(sample);
        console.log(`AI Pure Result: ${result}`);
        console.log("-----------------------------------\n");
    }
}

test().catch(console.error);
