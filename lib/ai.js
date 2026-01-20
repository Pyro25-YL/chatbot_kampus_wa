const { NlpManager } = require('node-nlp');
const fs = require('fs');
const { FILE_MODEL } = require('../config');

const manager = new NlpManager({ languages: ['id'] });

// Load Model saat start
if (fs.existsSync(FILE_MODEL)) {
    manager.load(FILE_MODEL);
    console.log("🧠 AI Loaded: Siap Berpikir.");
} else {
    // Jika tidak ada model, tidak masalah, karena kita punya backup logic manual di bawah
    console.log("⚠️ PERINGATAN: File model.nlp tidak ditemukan (Mengandalkan Logic Manual).");
}

const processText = async (text) => {
    // 1. Biarkan NLP menebak dulu (kalau model ada)
    // Jika model belum dilatih, hasilnya mungkin 'None'
    const result = await manager.process('id', text);
    
    // Normalisasi teks agar pencocokan lebih mudah
    const input = text.toLowerCase();

    // ==========================================================
    // --- HYBRID INTELLIGENCE (Override Logic / Hard Rules) ---
    // Logika manual untuk memastikan akurasi perintah spesifik
    // ==========================================================
    
    // 1. TUTORIAL / PANDUAN
    if (input.includes('tutorial') || input.includes('panduan')) {
        result.intent = 'tutorial.lihat';
        result.score = 1.0;
    }
    // 2. MENU & BANTUAN
    else if (input.includes('menu') || input.includes('help') || input.includes('bantuan')) {
        result.intent = 'menu.lihat';
        result.score = 1.0;
    }

    // 3. TAMBAH TUGAS (Prioritas Tinggi)
    else if (input.includes('tambah tugas') || input.includes('catat tugas') || input.includes('buat tugas')) {
        result.intent = 'tugas.tambah';
        result.score = 1.0;
    }

    // 4. TAMBAH JADWAL (FITUR BARU)
    // Harus dicek sebelum "lihat jadwal" agar tidak tertukar
    else if (input.includes('tambah jadwal') || input.includes('isi jadwal') || input.includes('buat jadwal')) {
        result.intent = 'jadwal.tambah';
        result.score = 1.0;
    }

    // 5. LIHAT TUGAS
    else if (input.includes('tugas') || input.includes('pr ') || input.includes('pekerjaan rumah') || input.includes('cek tugas')) {
        // Pastikan bukan 'tambah tugas' (sudah dicegat di atas)
        result.intent = 'tugas.lihat';
        result.score = 1.0;
    }

    // 6. LIHAT JADWAL
    else if (input.includes('jadwal') || input.includes('kuliah') || input.includes('matkul') || input.includes('pelajaran')) {
        // Pastikan bukan 'tambah jadwal' (sudah dicegat di atas)
        result.intent = 'jadwal.lihat';
        result.score = 1.0;
    }

    // 7. SAPAAN SEDERHANA (Jika NLP Gagal)
    else if (['p', 'bot', 'min', 'halo', 'hai'].some(s => input === s)) {
        result.intent = 'obrolan.bebas';
        result.answer = "Halo! Ketik *!menu* untuk melihat apa yang bisa aku bantu ya. 👋";
        result.score = 1.0;
    }

    return result;
};

module.exports = { processText };
