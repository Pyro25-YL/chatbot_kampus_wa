const { NlpManager } = require('node-nlp');
const fs = require('fs');
const { FILE_MODEL } = require('../config');

// ============================================================
// 1. SETUP ENGINE
// ============================================================
const manager = new NlpManager({ 
    languages: ['id'], 
    nlu: { useNoneFeature: true } 
});

// Kamus Normalisasi (Disesuaikan agar tidak merusak kata gaul)
const dictionary = {
    "kagakk": "tidak", "kaga": "tidak", "gak": "tidak", "nggak": "tidak",
    "yijakk": "jelek", "yijak": "jelek",
    "pr": "tugas", "task": "tugas", 
    "matkul": "jadwal", "mapel": "jadwal",
    "min": "bot", "p": "halo"
};

let isModelLoaded = false;

// ============================================================
// 2. FUNGSI LOAD BOT
// ============================================================
const loadBot = async () => {
    try {
        if (fs.existsSync(FILE_MODEL)) {
            const stats = fs.statSync(FILE_MODEL);
            console.log(`📂 Memuat otak AI (${(stats.size / 1024 / 1024).toFixed(2)} MB)...`);
            
            const data = fs.readFileSync(FILE_MODEL, 'utf8');
            manager.import(JSON.parse(data));
            isModelLoaded = true;
            console.log("🧠 NEURAL ENGINE: ONLINE (Siap Ngobrol & Kerja)");
        } else {
            console.log("⚠️ WARNING: File model.nlp tidak ditemukan!");
        }
    } catch (err) {
        console.error("❌ Gagal memuat AI:", err);
    }
};

// ============================================================
// 3. LOGIKA PROSES (HYBRID + SMART FILTER)
// ============================================================
const processText = async (text, senderId) => {
    if (!text) return { intent: 'None', score: 0 };
    
    let cleanText = text.toLowerCase().trim();
    
    // Normalisasi kata kunci penting
    Object.keys(dictionary).forEach(key => {
        const regex = new RegExp(`\\b${key}\\b`, 'g');
        cleanText = cleanText.replace(regex, dictionary[key]);
    });

    // ---------------------------------------------------------
    // 🚧 BYPASS PERINTAH (Tugas & Jadwal) - Pasti Akurat
    // ---------------------------------------------------------
    
    // Perintah Tambah
    if (cleanText.startsWith('tambah tugas') || cleanText.startsWith('catat tugas')) {
        const isiTugas = text.replace(/^(tambah|catat)\s+tugas\s*/i, '').trim();
        return { intent: 'tugas.tambah', score: 1.0, entities: [{ entity: 'isi_tugas', option: isiTugas }] };
    }

    // Perintah Lihat (Strict Keywords)
    const isAskingTask = cleanText.includes('tugas') || cleanText.includes('pr');
    const isAskingSchedule = cleanText.includes('jadwal') || cleanText.includes('matkul') || cleanText.includes('kuliah');
    const hasCommandWord = cleanText.match(/\b(lihat|cek|mana|list|daftar|info|dong|apa|ada|besok|hari)\b/);

    if (isAskingTask && (hasCommandWord || cleanText === 'tugas')) {
        return { intent: 'tugas.lihat', score: 1.0 };
    }
    if (isAskingSchedule && (hasCommandWord || cleanText === 'jadwal')) {
        return { intent: 'jadwal.lihat', score: 1.0 };
    }

    // ---------------------------------------------------------
    // 🗣️ ZONA NEURAL (Ngobrol & Tanya Jawab)
    // ---------------------------------------------------------
    if (!isModelLoaded) return { intent: 'None', score: 0 };

    const result = await manager.process('id', cleanText);

    // --- SMART THRESHOLD (Filter biar gak ngawur) ---
    
    // 1. Jika intent adalah obrolan/sapaan, kita lebih longgar (0.45)
    const isChat = result.intent.startsWith('chat.') || result.intent.startsWith('sapa.');
    if (isChat && result.score > 0.45) {
        return result;
    }

    // 2. Jika intent serius (informasi kampus/tugas), butuh keyakinan tinggi (0.7)
    // Ini gunanya biar kalau ditanya "hahaha" gak dijawab "Visi Misi Kampus"
    const isInfo = result.intent.includes('kampus') || result.intent.includes('akademik');
    if (isInfo && result.score < 0.7) {
        // Jika tidak yakin itu info kampus, cek lagi apakah dia ketawa
        if (cleanText.match(/\b(wkwk|haha|huhu|lucu|kocak)\b/)) {
            return { intent: 'chat.tawa', score: 0.9, answer: "wkwk bisa aja lu bang 😂" };
        }
        return { intent: 'None', score: result.score, answer: null };
    }

    // 3. Fallback Umum
    if (result.score > 0.6 && result.intent !== 'None') {
        return result;
    }

    // Cek kata kunci 'menu' sebagai benteng terakhir
    if (cleanText.includes('menu') || cleanText.includes('bantuan')) {
        return { intent: 'menu.lihat', score: 1.0 };
    }

    return { intent: 'None', score: result.score, answer: null };
};

module.exports = { loadBot, processText };