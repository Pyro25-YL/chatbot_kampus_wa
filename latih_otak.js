const { NlpManager } = require('node-nlp');
const fs = require('fs');
const bfj = require('bfj'); 

// ============================================================
// ⚙️ KONFIGURASI BRAIN (OPTIMIZED FOR ACCURACY)
// ============================================================
const manager = new NlpManager({
    languages: ['id'],
    nlu: { useNoneFeature: true, log: false },
    settings: {
        useNeural: true,
        hiddenLayers: [64, 32], // Arsitektur lebih dalam untuk logika lebih rumit
        activation: 'leaky-relu',
        epochs: 50, // Lebih banyak epoch untuk akurasi lebih tajam
        errorThresh: 0.0005 // Berhenti jika sudah sangat akurat
    }
});

// ============================================================
// 🧬 DATA CLEANER (Kualitas > Kuantitas)
// ============================================================
// Kita hapus generator variasi liar. Kita ganti dengan pembersihan teks.
const cleanText = (text) => {
    return text
        .toLowerCase()
        .replace(/[?!.,]/g, '') // Hapus tanda baca
        .replace(/\s+/g, ' ')   // Hapus spasi ganda
        .trim();
};

// ============================================================
// 🚀 MAIN ENGINE
// ============================================================
(async () => {
    console.clear();
    console.log("💎 SYSTEM: QUALITY-FOCUSED TRAINING 💎");
    
    // 1. DATA PROCESSING
    console.log("🔹 [1/3] Memproses Dataset...");
    const FILES = ['./corpus.json', './corpus_100k.json','/corpus_100k2.json'];
    let totalData = 0;
    let uniqueUtterances = new Set(); // Mencegah duplikat agar tidak kaku

    for (const filePath of FILES) {
        if (!fs.existsSync(filePath)) continue;
        const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        for (const group of json.data) {
            if (group.utterances) {
                for (const u of group.utterances) {
                    const clean = cleanText(u);
                    
                    // VALIDASI: Hanya masukkan jika belum ada (Unik)
                    // Ini kunci agar bot tidak "Overfitting" (Sotoy)
                    if (!uniqueUtterances.has(clean) && clean.length > 1) {
                        manager.addDocument('id', clean, group.intent);
                        uniqueUtterances.add(clean);
                        totalData++;
                    }
                }
            }
            if (group.answers) {
                group.answers.forEach(a => {
                    const answerText = typeof a === 'object' ? a.text : a;
                    manager.addAnswer('id', group.intent, answerText);
                });
            }
        }
    }
    
    console.log(`📊 QUALITY DATA: ${totalData.toLocaleString()} Unik Baris.`);

    // 2. TRAINING
    console.log("\n🔹 [2/3] Training Deep Learning Neural Network...");
    const start = Date.now();
    await manager.train();
    console.log(`✅ Akurasi Tercapai dalam: ${(Date.now() - start)/1000} detik.`);

    // 3. SAVING
// ... (Bagian training tetap sama)

// 3. SAVING (THE OPTIMIZED WAY)
console.log("\n🔹 [3/3] Menyimpan Model...");
try {
    // Ambil data dalam bentuk objek
    const finalModel = manager.nlp.toJSON();
    
    // Gunakan stringify standar tapi tanpa indentasi (biar cepat)
    const jsonString = JSON.stringify(finalModel);
    
    console.log(" ⏳ Menulis file ke disk...");
    fs.writeFileSync('./model.nlp', jsonString);
    
    console.log("\n🎉 BERHASIL TOTAL! Model sudah tersimpan.");
} catch (err) {
    console.error("\n❌ ERROR:", err.message);
}
})();