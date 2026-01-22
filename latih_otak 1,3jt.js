const { NlpManager } = require('node-nlp');
const fs = require('fs');
const bfj = require('bfj'); 

// ============================================================
// ⚙️ KONFIGURASI 1.3 JUTA DATA
// ============================================================
const manager = new NlpManager({
    languages: ['id'],
    nlu: { useNoneFeature: true },
    // Matikan fitur berat
    action: { enabled: false }, 
    sentiment: { enabled: false }, 
    // Settingan Deep Learning
    settings: {
        useNeural: true,
        hiddenLayers: [48], 
        activation: 'leaky-relu',
        epochs: 35 
    }
});

// ============================================================
// 🧬 GENERATOR DATA (Stabil di 1.3 Juta)
// ============================================================
const generateVariations = (base) => {
    if (!base || base.length < 2) return [];
    const prefixes = ['tolong', 'coba', 'bisa', 'min', 'woy', 'bot']; 
    const suffixes = ['dong', 'ya', 'sekarang', 'cepet', 'gan', 'kah']; 
    let results = [base];
    prefixes.forEach(p => results.push(`${p} ${base}`));
    suffixes.forEach(s => results.push(`${base} ${s}`));
    return results;
};

// ============================================================
// 🚀 MAIN ENGINE
// ============================================================
(async () => {
    if (global.gc) { global.gc(); }
    console.clear();
    console.log("🔥 SYSTEM: JUMBO TRAINING (BYPASS MODE) 🔥");
    
    // 1. DATA PROCESSING
    manager.addRegexEntity('nomor', ['id'], /\b\d+\b/g);
    manager.addNamedEntityText('matkul', 'coding', ['ngoding', 'js', 'html', 'program'], ['id']);
    
    console.log("🔹 [1/3] Memproses Dataset...");
    const FILES = ['./corpus.json', './corpus_100k.json'];
    let totalData = 0;

    for (const filePath of FILES) {
        if (!fs.existsSync(filePath)) continue;
        const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        for (const group of json.data) {
            if (group.utterances) {
                for (const u of group.utterances) {
                    const clean = u.replace(/[?!.,]/g, '').trim().toLowerCase();
                    if (!clean) continue;
                    
                    const vars = generateVariations(clean);
                    for (const v of vars) {
                        manager.addDocument('id', v, group.intent);
                        totalData++;
                    }
                }
            }
            if (group.answers) {
                group.answers.forEach(a => manager.addAnswer('id', group.intent, typeof a === 'object' ? a.text : a));
            }
        }
        if (global.gc) { global.gc(); }
    }
    console.log(`📊 TOTAL DATA: ${totalData.toLocaleString()} Baris.`);

    // 2. TRAINING
    console.log("\n🔹 [2/3] Training Neural Network...");
    const start = Date.now();
    await manager.train();
    console.log(`✅ Training Selesai: ${(Date.now() - start)/1000} detik.`);

    // 3. SAVING (THE FIX)
    console.log("\n🔹 [3/3] Menyimpan Model...");
    console.log("   👉 Mengambil data inti (Bypass Export)...");

    try {
        // --- INI KUNCI PERBAIKANNYA ---
        // Kita tidak pakai manager.nlu.export() yang error.
        // Kita langsung ambil dari manager.nlp.toJSON().
        // manager.nlp pasti ada karena training berhasil.
        const sourceData = manager.nlp.toJSON();
        
        // Kita bungkus ulang sesuai format yang dimengerti AI nanti
        const finalModel = {
            settings: manager.settings,
            languages: manager.languages,
            ...sourceData // Spread syntax: Memasukkan nlu, ner, nlg ke dalam sini
        };

        console.log("   ⏳ Sedang menulis file (Streaming BFJ)...");
        
        // Tulis ke file
        await bfj.write('./model.nlp', finalModel, { space: 0 });
        
        console.log("\n🎉 BERHASIL TOTAL! File 'model.nlp' sudah jadi.");
        console.log("💾 Ukuran file mungkin besar (ratusan MB), tapi isinya 1.3 Juta data.");

    } catch (err) {
        console.error("\n❌ ERROR:", err.message);
        console.log("👉 Detail Error:", err.stack);
    }
})();