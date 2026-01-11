const { NlpManager } = require('node-nlp');
const fs = require('fs');
const path = require('path');

// --- 1. KONFIGURASI TINGKAT LANJUT ---
// Menggunakan ambang batas (threshold) agar bot tidak 'halusinasi'.
// 'autoSave': false agar kita punya kontrol penuh kapan menyimpan model.
const manager = new NlpManager({ 
    languages: ['id'], 
    forceNER: true, 
    nlu: { 
        useNoneFeature: true,
        log: true 
    },
    ner: { 
        threshold: 0.8 // NER harus sangat yakin (80%)
    }
});

// --- 2. FUNGSI PEMBANTU (HELPER) ---
// Memuat data dengan error handling yang baik
const loadCorpus = (filePath) => {
    try {
        const rawData = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(rawData);
    } catch (error) {
        console.error("❌ Gagal memuat Corpus:", error.message);
        process.exit(1);
    }
};

// --- 3. DEFINISI ENTITAS (NER) ---

// A. Enum Entities (Kata Kunci Spesifik)
const matkulEntities = [
    { name: 'matematika', alias: ['mtk', 'mate', 'kalkulus', 'aljabar', 'linear'] },
    { name: 'fisika', alias: ['fisdas', 'mekanika', 'termodinamika'] },
    { name: 'biologi', alias: ['bio', 'genetika'] },
    { name: 'kimia', alias: ['kimdas', 'organik'] },
    { name: 'pemrograman', alias: ['coding', 'ngoding', 'algo', 'algoritma', 'java', 'python', 'js', 'golang'] },
    { name: 'basis_data', alias: ['basdat', 'sql', 'mysql', 'postgres', 'db'] },
    { name: 'jaringan', alias: ['jarkom', 'network', 'cisco', 'mikrotik'] },
    { name: 'desain', alias: ['ui/ux', 'figma', 'photoshop', 'dkv'] }
];

// B. Regex Entities (Pola Dinamis) - INI YANG "PROFESOR"
// Mengenali pola seperti "Tugas 1", "Bab 3", atau format tanggal sederhana
const regexEntities = [
    { 
        name: 'nomor_tugas', 
        regex: /\b(tugas|latihan|bab)\s+(\d+)\b/gi 
    },
    { 
        name: 'deadline_simple', 
        regex: /\b(besok|lusa|hari ini)\b/gi 
    }
];

// --- 4. EKSEKUSI PELATIHAN ---

(async () => {
    console.log("🚀 Memulai Inisialisasi Model...");

    // 4.1. Inject Enum Entities
    console.log("🔹 Memuat Entitas Mata Kuliah...");
    matkulEntities.forEach(m => {
        manager.addNamedEntityText('matkul', m.name, [m.name, ...m.alias], ['id']);
    });

    // 4.2. Inject Regex Entities
    console.log("🔹 Memuat Entitas Regex...");
    regexEntities.forEach(r => {
        manager.addRegexEntity(r.name, ['id'], r.regex);
    });

    // 4.3. Memuat & Inject Corpus (Intent & Utterances)
    const corpusPath = path.join(__dirname, 'corpus.json');
    const corpus = loadCorpus(corpusPath);
    
    console.log(`🔹 Memproses ${corpus.data.length} kategori intent dari Corpus...`);
    corpus.data.forEach(kategori => {
        kategori.utterances.forEach(kalimat => {
            manager.addDocument('id', kalimat, kategori.intent);
        });
        
        // (Opsional) Jika ada jawaban statis di JSON corpus
        if (kategori.answers) {
            kategori.answers.forEach(jawab => {
                manager.addAnswer('id', kategori.intent, jawab);
            });
        }
    });

    // 4.4. Jawaban Fallback & Spesifik
    // Jawaban default jika score < threshold nanti saat proses
    manager.addAnswer('id', 'None', 'Maaf, saya kurang paham konteks akademiknya. Bisa diperjelas?');

    // 4.5. Training Process
    console.log("\n🧠 Sedang Melatih Neural Network...");
    const hrstart = process.hrtime();
    
    await manager.train();
    
    const hrend = process.hrtime(hrstart);
    console.log(`✅ Pelatihan Selesai dalam ${hrend[0]}s ${hrend[1] / 1000000}ms`);

    // 4.6. Saving
    manager.save();
    console.log("💾 Model disimpan ke './model.nlp'");
    
    // 4.7. Quick Test (Verifikasi Langsung)
    console.log("\n--- 🔍 Uji Coba Cepat ---");
    const testSentences = [
        "Ada tugas kalkulus gak?",
        "Ingatkan tugas coding besok",
        "Hapus tugas bab 3"
    ];

    for (const sentence of testSentences) {
        const result = await manager.process('id', sentence);
        const entities = result.entities.map(e => `${e.entity}:${e.option || e.utteranceText}`).join(', ');
        console.log(`Input: "${sentence}" \n -> Intent: [${result.intent}] (Score: ${result.score.toFixed(2)}) \n -> Entities: [${entities}]\n`);
    }

})();