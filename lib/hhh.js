const { NlpManager } = require('node-nlp');
const fs = require('fs');
const { FILE_MODEL } = require('../config');

const manager = new NlpManager({ languages: ['id'], nlu: { useNoneFeature: true } });
let isModelLoaded = false;

const loadBot = async () => {
    try {
        if (fs.existsSync(FILE_MODEL)) {
            const data = fs.readFileSync(FILE_MODEL, 'utf8');
            manager.import(JSON.parse(data));
            isModelLoaded = true;
            console.log("🧠 JUMBO ENGINE (1.3M): READY & PROTECTED");
        }
    } catch (err) { console.error("❌ Gagal load model:", err); }
};

const processText = async (text) => {
    if (!text || !isModelLoaded) return { intent: 'None', score: 0 };
    
    let cleanText = text.toLowerCase().trim();

    // ==========================================================
    // 🛡️ LAYER 1: HARD-CODED BYPASS (PERINTAH KERJA)
    // Ini biar bot GAK MUNGKIN jawab "curhat" pas disuruh cek tugas.
    // ==========================================================
    
    // A. Deteksi Lihat Tugas/Jadwal
    const isCheck = cleanText.match(/\b(lihat|cek|mana|daftar|list|info|tampil)\b/);
    const isTask = cleanText.match(/\b(tugas|pr)\b/);
    const isSchedule = cleanText.match(/\b(jadwal|matkul|kuliah)\b/);

    if (isTask && (isCheck || cleanText === 'tugas')) {
        return { intent: 'tugas.lihat', score: 1.0 };
    }
    if (isSchedule && (isCheck || cleanText === 'jadwal')) {
        return { intent: 'jadwal.lihat', score: 1.0 };
    }

    // B. Deteksi Tambah Tugas/Jadwal
    if (cleanText.includes('tambah') || cleanText.startsWith('catat')) {
        if (isTask) {
            const isi = text.replace(/.*?(tugas)\s*/i, '').trim();
            return { intent: 'tugas.tambah', score: 1.0, entities: [{ entity: 'isi_tugas', option: isi }] };
        }
        if (isSchedule) {
            const isi = text.replace(/.*?(jadwal)\s*/i, '').trim();
            return { intent: 'jadwal.tambah', score: 1.0, entities: [{ entity: 'isi_jadwal', option: isi }] };
        }
    }

    // ==========================================================
    // 🧠 LAYER 2: NEURAL NETWORK (OBROLAN)
    // ==========================================================
    const result = await manager.process('id', cleanText);

    // Filter Anti-Ngawur:
    // 1. Kalau user ketawa, paksa masuk intent tawa.
    if (cleanText.match(/(wkwk|haha|huhu|kocak|lucu|anjir)/)) {
        return { 
            intent: 'chat.tawa', 
            score: 1.0, 
            answer: "Wkwk bisa aja lu bang! 😂" 
        };
    }

    // 2. Cegah Visi Misi Keluar Pas Ngobrol (Thresholding)
    // Jika AI menebak intent "Kampus/Info" tapi skornya di bawah 0.8,
    // mending dianggap chat biasa aja.
    if (result.intent.includes('kampus') && result.score < 0.8) {
        if (cleanText.length < 15) { // Obrolan singkat biasanya bukan nanya visi misi
            return { intent: 'chat.sapa', score: 0.9, answer: "Kenapa bang? Ada yang bisa dibantu?" };
        }
    }

    // 3. Jika skor terlalu rendah, jangan asal jawab.
    if (result.score < 0.5) {
        return { intent: 'None', score: result.score, answer: null };
    }

    return result;
};

module.exports = { loadBot, processText };