const { NlpManager } = require('node-nlp');
const fs = require('fs');
// const { FILE_MODEL } = require('../config'); // Kalau config belum ada, hardcode dulu path-nya di bawah
const FILE_MODEL = './model.nlp'; 

const manager = new NlpManager({ languages: ['id'], nlu: { useNoneFeature: true } });
let isModelLoaded = false;

// Ganti nama jadi init biar sinkron sama index.js
const init = async () => {
    try {
        if (fs.existsSync(FILE_MODEL)) {
            const data = fs.readFileSync(FILE_MODEL, 'utf8');
            manager.import(JSON.parse(data));
            isModelLoaded = true;
            console.log("🧠 JUMBO ENGINE (1.3M): READY & PROTECTED");
        } else {
            console.log("⚠️ Model NLP belum ada, bot berjalan dengan Logic Manual (Layer 1).");
        }
    } catch (err) { 
        console.error("❌ Gagal load model:", err); 
    }
};

const processText = async (text) => {
    if (!text) return { intent: 'None', score: 0 };
    let cleanText = text.toLowerCase().trim();

    // --- LAYER 1: LOGIKA MANUAL (BYPASS) ---
    const isCheck = cleanText.match(/\b(lihat|cek|mana|daftar|list|info|tampil)\b/);
    const isTask = cleanText.match(/\b(tugas|pr)\b/);
    const isSchedule = cleanText.match(/\b(jadwal|matkul|kuliah)\b/);
    const isDelete = cleanText.match(/\b(hapus|delete|kelar|selesai|batal)\b/);

    if (isTask && (isCheck || cleanText === 'tugas' || cleanText === 'list tugas')) {
        return { intent: 'tugas.lihat', score: 1.0 };
    }
    if (isSchedule && (isCheck || cleanText === 'jadwal' || cleanText === 'cek jadwal')) {
        return { intent: 'jadwal.lihat', score: 1.0 };
    }

    // Logic Tambah Tugas
    const isTambah = cleanText.includes('tambah') || cleanText.startsWith('catat') || cleanText.startsWith('input') || cleanText.includes('baru');
    const hasKeywords = cleanText.includes('matkul') && cleanText.includes('deadline');

    if ((isTambah && isTask) || hasKeywords) {
        const isi = text.replace(/.*?(tugas|pr)\s*/i, '').trim();
        const deadlineMatch = text.match(/deadline\s+([\w\s,.:-]+)/i);
        let deadline = deadlineMatch ? deadlineMatch[1].trim() : null;
        if (deadline && deadline.includes(',')) deadline = deadline.split(',')[0].trim();

        return { 
            intent: 'tugas.tambah', 
            score: 1.0, 
            entities: [
                { entity: 'isi_tugas', option: isi },
                { entity: 'deadline', option: deadline }
            ] 
        };
    }

    if ((isTambah && isSchedule)) {
        const isi = text.replace(/.*?(jadwal)\s*/i, '').trim();
        return { intent: 'jadwal.tambah', score: 1.0, entities: [{ entity: 'isi_jadwal', option: isi }] };
    }

    if (isTask && isDelete) {
        const numbers = cleanText.match(/\d+/g); 
        if (numbers) {
            return { intent: 'tugas.hapus_pilih', score: 1.0, entities: [{ entity: 'nomor_tugas', option: numbers }] };
        }
        return { intent: 'tugas.hapus_confirm', score: 1.0 };
    }

    // --- LAYER 2: AI MODEL ---
    if (!isModelLoaded) return { intent: 'None', score: 0 };
    
    const result = await manager.process('id', cleanText);
    if (cleanText.match(/(wkwk|haha|huhu|kocak|lucu|anjir|awok)/)) {
        return { intent: 'chat.tawa', score: 1.0, answer: "Wkwk bisa aja lu bang! 😂" };
    }
    if (result.score < 0.5) return { intent: 'None', score: result.score };

    return result;
};

// EKSPOR YANG PENTING
module.exports = { init, processText };