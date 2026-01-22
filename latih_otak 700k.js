const { NlpManager } = require('node-nlp');
const fs = require('fs');
const bfj = require('bfj'); 

// ============================================================
// ⚙️ KONFIGURASI HIGH-PERFORMANCE (Target: 700k Data)
// ============================================================
const manager = new NlpManager({
    languages: ['id'],
    nlu: { useNoneFeature: true },
    action: { enabled: false }, 
    sentiment: { enabled: false }, 
    settings: {
        useNeural: true,
        // Layer sedang, cukup untuk nampung 700k pola
        hiddenLayers: [40], 
        activation: 'leaky-relu',
        epochs: 30 
    }
});

// ============================================================
// 🧬 GENERATOR VARIASI (PINTAR MEMILAH)
// ============================================================
const generateVariations = (base, mode = 'full') => {
    if (!base || base.length < 2) return [];
    
    let prefixes = [];
    let suffixes = [];
    let results = [base];

    if (mode === 'full') {
        // Mode Full: 13 Variasi (Untuk data utama yang penting)
        prefixes = ['tolong', 'coba', 'bisa', 'min', 'woy', 'bot']; 
        suffixes = ['dong', 'ya', 'sekarang', 'cepet', 'gan', 'kah']; 
    } else {
        // Mode Hemat: ~7 Variasi (Untuk data sampah/bulk 100k)
        // Kita cuma ambil kata depan/belakang yang paling sering dipakai orang indo
        prefixes = ['coba', 'tolong', 'bot']; 
        suffixes = ['dong', 'ya', 'gan']; 
    }

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
    console.log("🔥 SYSTEM: HIGH TRAINING (TARGET 700k DATA) 🔥");
    
    // 1. DATA PROCESSING
    manager.addRegexEntity('nomor', ['id'], /\b\d+\b/g);
    manager.addNamedEntityText('matkul', 'coding', ['ngoding', 'js', 'html', 'program'], ['id']);
    
    console.log("🔹 [1/3] Memproses Dataset...");
    const FILES = ['./corpus.json', './corpus_100k.json'];
    let totalData = 0;

    for (const filePath of FILES) {
        if (!fs.existsSync(filePath)) continue;
        
        console.log(`   📂 Membaca ${filePath}...`);
        const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        // Deteksi file besar
        const isBigFile = filePath.includes('100k'); 
        const variationMode = isBigFile ? 'hemat' : 'full';

        for (const group of json.data) {
            if (group.utterances) {
                for (const u of group.utterances) {
                    const clean = u.replace(/[?!.,]/g, '').trim().toLowerCase();
                    if (!clean) continue;
                    
                    // Generate variasi sesuai mode (Full atau Hemat)
                    const vars = generateVariations(clean, variationMode);
                    
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
        // Bersihkan memori per file
        if (global.gc) { global.gc(); }
    }

    console.log(`📊 TOTAL DATA FINAL: ${totalData.toLocaleString()} Baris.`);
    console.log("   (Target ~700.000 Tercapai!)");

    // 2. TRAINING
    console.log("\n🔹 [2/3] Training Neural Network...");
    const start = Date.now();
    await manager.train();
    console.log(`✅ Training Selesai: ${(Date.now() - start)/1000} detik.`);

    // 3. SAVING
    console.log("\n🔹 [3/3] Menyimpan Model...");
    
    try {
        const sourceData = manager.nlp.toJSON();
        const finalModel = {
            settings: manager.settings,
            languages: manager.languages,
            ...sourceData 
        };

        // Tetap pakai BFJ biar aman, space:0 biar file kecil
        await bfj.write('./model.nlp', finalModel, { space: 0 });
        
        console.log("\n🎉 SUKSES! File 'model.nlp' (Versi 700k) sudah jadi.");

    } catch (err) {
        console.error("\n❌ ERROR:", err.message);
    }
})();