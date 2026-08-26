const fs = require('fs');
const { getAdminPromptText } = require('./admin'); 
const pool = require('../lib/db');
require('dotenv').config();
const axios = require('axios');

// --- SETUP OLLAMA LOCAL CONFIG ---
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:7b';

// --- KAMUS WAKTU ---
const ID_MONTHS = {
    'januari': 0, 'februari': 1, 'maret': 2, 'april': 3, 'mei': 4, 'juni': 5,
    'juli': 6, 'agustus': 7, 'september': 8, 'oktober': 9, 'november': 10, 'desember': 11,
    'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'mei': 4, 'jun': 5,
    'jul': 6, 'agu': 7, 'sep': 8, 'okt': 9, 'nov': 10, 'des': 11
};

const ID_DAYS = {
    'minggu': 0, 'senin': 1, 'selasa': 2, 'rabu': 3, 
    'kamis': 4, 'jumat': 5, 'sabtu': 6
};

// Fungsi Terjemah Hari
const terjemahkanHari = (teks) => {
    let teksBaru = teks.toLowerCase();
    const now = new Date();

    if (teksBaru.includes('besok')) {
        let besok = new Date(now);
        besok.setDate(besok.getDate() + 1);
        teksBaru = teksBaru.replace(/\bbesok\b/g, `${besok.getDate()} ${Object.keys(ID_MONTHS)[besok.getMonth()]}`);
    }
    if (teksBaru.includes('lusa')) {
        let lusa = new Date(now);
        lusa.setDate(lusa.getDate() + 2);
        teksBaru = teksBaru.replace(/\blusa\b/g, `${lusa.getDate()} ${Object.keys(ID_MONTHS)[lusa.getMonth()]}`);
    }

    for (const [dayName, dayNum] of Object.entries(ID_DAYS)) {
        const regex = new RegExp(`\\b${dayName}\\b`, 'g');
        if (regex.test(teksBaru)) {
            const currentDay = now.getDay();
            let daysToAdd = dayNum - currentDay;
            if (daysToAdd <= 0) daysToAdd += 7;

            let targetDate = new Date(now);
            targetDate.setDate(targetDate.getDate() + daysToAdd);
            
            const tglString = `${targetDate.getDate()} ${Object.keys(ID_MONTHS)[targetDate.getMonth()]}`;
            teksBaru = teksBaru.replace(regex, tglString);
        }
    }
    return teksBaru;
};

// --- KONFIGURASI AI & ADMIN ---
const MAX_HISTORY_LENGTH = 10; 

const buildSystemPrompt = async () => {
    const infoAdminSistem = await getAdminPromptText();
    return `Lu adalah "Shion", teman tongkrongan WhatsApp yang asik dan nyambung diajak ngobrol.

ATURAN WAJIB — JANGAN DILANGGAR:
- SELALU pakai "gw" (bukan aku/saya) dan "lu" (bukan kamu/anda/kau). Ini harga mati.
- Jawab SINGKAT, maksimal 1-2 kalimat pendek. JANGAN lebih dari itu.
- JANGAN mengarang cerita, konteks, atau situasi yang tidak disebutkan user.
- JANGAN bahas topik yang tidak ada di pesan user.
- Balas sesuai PERSIS dengan apa yang user ketik. Singkat dibalas singkat.
- JANGAN pakai emoji kecuali user yang mulai pakai emoji.
- JANGAN tanya balik lebih dari 1 pertanyaan.
- JANGAN mulai dengan "Hey!", "Hei!", "Tidak masalah!", atau basa-basi formal.

🎯 INFO NOMOR ADMIN KAMU:
Jika user bertanya tentang admin bot, daftar admin, atau meminta nomor kontak admin, kamu WAJIB memberikan info nomor ini dengan gaya santai lu:
${infoAdminSistem}`;
};

const init = async () => {
    console.log(`🧠 SISTEM AI READY: OLLAMA LOCAL (${OLLAMA_MODEL} @ ${OLLAMA_URL})`);
};

// --- FUNGSI TEMBAK OLLAMA LOCAL (DIOPTIMALKAN UNTUK QWEN2.5:7B LOKAL) ---
const askOllama = async (messages, formatJson = false) => {
    const payload = {
        model: OLLAMA_MODEL,
        messages: messages,
        stream: false,
        keep_alive: "24h", // Model tetap standby di memori tanpa cold-start
        options: {
            temperature: 0.3,
            num_predict: formatJson ? 80 : 35, // Batasi token output agar instan selesai
            num_ctx: 1024,                      // Perkecil konteks agar hemat RAM
            num_thread: 6                       // Maksimalkan core processor
        }
    };
    if (formatJson) {
        payload.format = 'json';
    }
    const response = await axios.post(`${OLLAMA_URL}/api/chat`, payload, { timeout: 60000 });
    return response.data.message.content;
};

// --- ENGINE UTAMA CHATBOT AI ---
const chatWithAI = async (prompt, sessionId = 'default') => {
    try {
        const resHistory = await pool.query(
            `SELECT role, content FROM (
                SELECT role, content, created_at FROM chat_history 
                WHERE session_id = $1 
                ORDER BY created_at DESC LIMIT $2
            ) sub ORDER BY created_at ASC`,
            [sessionId, MAX_HISTORY_LENGTH]
        );

        const dbHistory = resHistory.rows;
        const systemPrompt = await buildSystemPrompt();

        const currentHistory = [
            { role: 'system', content: systemPrompt },
            ...dbHistory,
            { role: 'user', content: prompt }
        ];

        await pool.query(
            `INSERT INTO chat_history (session_id, role, content) VALUES ($1, $2, $3)`,
            [sessionId, 'user', prompt]
        );

        let aiReply = await askOllama(currentHistory);

        aiReply = fixPronouns(aiReply);
        const sentences = aiReply.split(/(?<=[.!?])\s+/);
        const shortReply = aiReply.includes('Wa.me/') ? aiReply : sentences.slice(0, 2).join(' ');

        await pool.query(
            `INSERT INTO chat_history (session_id, role, content) VALUES ($1, $2, $3)`,
            [sessionId, 'assistant', shortReply]
        );

        return shortReply;
    } catch (error) {
        console.error("❌ Error Ollama chatWithAI:", error.message);
        return "Waduh, server Ollama qwen2.5:7b lokal lu belum nyala atau modelnya belum di-pull nih bro!";
    }
};

// --- HELPER NLU INTENT & ENTITY PARSER VIA OLLAMA ---
const askLLMForJSON = async (prompt) => {
    try {
        const content = await askOllama([
            { role: 'system', content: 'You are an accurate intent & entity parser for academic campus chatbot. Always respond in strict JSON format only.' },
            { role: 'user', content: prompt }
        ], true);
        return JSON.parse(content);
    } catch (e) {
        return null;
    }
};

const parseIntentWithAI = async (text) => {
    try {
        const prompt = `Analisis teks pesan berikut dan tentukan intent serta entitasnya untuk bot kampus.

Daftar Intent yang Valid:
- "jadwal.lihat" : ingin melihat/cek/spill jadwal kuliah (misal: "jadwal woi", "ada kelas apa besok", "spill jadwal dong")
- "jadwal.tambah" : menambah/buat jadwal baru
- "jadwal.hapus" : menghapus jadwal (sertakan nomor)
- "jadwal.edit" : mengubah jadwal
- "jadwal_sementara.lihat" : melihat jadwal pengganti/tambahan/khusus
- "jadwal_sementara.tambah" : menambah kelas pengganti/jadwal sementara
- "tugas.lihat" : melihat daftar tugas/pr (misal: "spill tugas", "tugas belum selesai apa aja")
- "tugas.tambah" : menambah tugas baru
- "tugas.selesai" : menandai tugas selesai
- "tugas.hapus" : menghapus tugas
- "dosen.lihat" : melihat daftar dosen/kontak dosen
- "dosen.tambah" : menambah dosen baru
- "dosen.edit" : mengubah data dosen
- "dosen.hapus" : menghapus data dosen
- "kelas.set" : menghubungkan grup ke nama kelas (misal: "set kelas 2024A", "pilih kelas TI-A")
- "chat.ai" : obrolan santai, sapaan, guyonan, curhat, di luar perintah kampus

Format JSON WAJIB:
{
  "intent": "nama_intent_di_atas",
  "matkul": "nama matkul jika ada atau null",
  "dosen": "nama dosen jika ada atau null",
  "hari": "nama hari atau null",
  "nomor": "nomor urut jika ada atau null",
  "nama_kelas": "nama kelas jika kelas.set atau null"
}

Pesan Pengguna: "${text}"
`;

        return await askLLMForJSON(prompt);
    } catch (e) {
        return null;
    }
};

// --- LAYER 1 (ROUTING INTENT CEPAT & AI NLU FLEKSIBEL) ---
const processText = async (textRaw, sessionId = 'default') => {
    if (!textRaw) return { intent: 'None', score: 0 };
    
    let text = terjemahkanHari(textRaw); 
    let cleanText = text.toLowerCase().trim();

    if (cleanText.includes('admin') && !cleanText.includes('jadwal') && !cleanText.includes('tugas')) {
        let balasanManual = `👥 *DAFTAR ADMIN BOT WA* 👥\n\n${infoAdminSistem}\n_Silakan hubungi salah satu admin di atas jika ada kendala sistem._`;
        return { intent: 'chat.ai', score: 1.0, answer: balasanManual };
    }
    if (['menu', 'help', 'bantuan', '!menu'].includes(cleanText)) return { intent: 'menu.lihat', score: 1.0 };
    if (cleanText.includes('tutorial') || cleanText.includes('panduan')) return { intent: 'tutorial.lihat', score: 1.0 };

    // 1. FAST REGEX ROUTING (Kecepatan tinggi < 10ms)
    if (
        cleanText.includes('jadwal sementara') || 
        cleanText.includes('jadwal tambahan') || 
        cleanText.includes('jadwal pengganti') || 
        cleanText.includes('ganti jadwal')
    ) {
        if (cleanText.match(/(tambah|buat|ganti|pindah|alihkan)/)) return { intent: 'jadwal_sementara.tambah', score: 1.0 };
        if (cleanText.includes('hapus')) return { intent: 'jadwal_sementara.hapus', score: 1.0 };
        if (cleanText.includes('edit') || cleanText.includes('ubah')) return { intent: 'jadwal_sementara.edit', score: 1.0 };
        return { intent: 'jadwal_sementara.lihat', score: 1.0 };
    }

    if (cleanText.startsWith('tambah tugas')) {
        const isi = text.replace(/.*?(tugas|pr|baru|buat|catat)\s*/i, '').trim();
        const deadlineMatch = text.match(/deadline\s+([\w\s,.:-]+)/i);
        let deadline = deadlineMatch ? deadlineMatch[1].trim() : null;
        if (deadline && deadline.includes(',')) deadline = deadline.split(',')[0].trim();
        return { intent: 'tugas.tambah', score: 1.0, entities: [{ entity: 'isi_tugas', option: isi }, { entity: 'deadline', option: deadline }] };
    }

    if (cleanText.startsWith('tambah jadwal')) {
        const isi = text.replace(/.*?(jadwal)\s*/i, '').trim();
        return { intent: 'jadwal.tambah', score: 1.0, entities: [{ entity: 'isi_jadwal', option: isi }] };
    }

    if (cleanText === 'jadwal' || cleanText === '!jadwal' || cleanText.match(/^(lihat|cek|list|daftar|spill|mana)\s+jadwal/i)) {
        return { intent: 'jadwal.lihat', score: 1.0 };
    }

    if (cleanText === 'dosen' || cleanText === '!dosen' || cleanText.match(/^(lihat|cek|list|daftar|kontak)\s+dosen/i)) {
        return { intent: 'dosen.lihat', score: 1.0 };
    }

    if (cleanText === 'tugas' || cleanText === '!tugas' || cleanText.match(/^(lihat|cek|list|daftar|spill)\s+tugas/i)) {
        return { intent: 'tugas.lihat', score: 1.0 };
    }

    if (
        cleanText === 'absensi' || 
        cleanText === '!absensi' || 
        cleanText === 'absen' || 
        cleanText === '!absen' || 
        cleanText.match(/^(lihat|cek|list|daftar|spill|rekap|pantau)\s+absen(?:si)?/i) ||
        cleanText.startsWith('absensi') ||
        cleanText.startsWith('absen ') ||
        cleanText.includes('rekap absensi') ||
        cleanText.includes('kehadiran')
    ) {
        return { intent: 'absensi.lihat', score: 1.0 };
    }

    // 2. CEK APAKAH MENGANDUNG KATA KUNCI AKADEMIK UNTUK NLU PARSER
    const hasAcademicKeywords = cleanText.match(/\b(jadwal|matkul|kuliah|pelajaran|dosen|tugas|pr|deadline|kelas|grup|set kelas|ruangan|ruang|pengganti|sementara|pj|absen|absensi|kehadiran)\b/i);

    if (hasAcademicKeywords) {
        const aiParsed = await parseIntentWithAI(textRaw);
        if (aiParsed && aiParsed.intent && aiParsed.intent !== 'chat.ai') {
            const entities = [];
            if (aiParsed.nama_kelas) entities.push({ entity: 'nama_kelas', option: aiParsed.nama_kelas });
            if (aiParsed.nomor) {
                entities.push({ entity: 'nomor_jadwal', option: String(aiParsed.nomor) });
                entities.push({ entity: 'nomor_tugas', option: String(aiParsed.nomor) });
            }
            return {
                intent: aiParsed.intent,
                score: 1.0,
                entities,
                aiData: aiParsed
            };
        }
    }

    // 3. LAYER 2: LLM CHATBOT OLLAMA LOCAL
    const aiResponse = await chatWithAI(text, sessionId);
    
    return { 
        intent: 'chat.ai', 
        score: 1.0, 
        answer: aiResponse 
    };
};

const fixPronouns = (text) => {
    return text
        .replace(/\bkamu\b/gi, 'lu')
        .replace(/\banda\b/gi, 'lu')
        .replace(/\bsaya\b/gi, 'gw')
        .replace(/\baku\b/gi, 'gw')
        .replace(/\bkau\b/gi, 'lu')
        .replace(/\bHey!\s*/gi, '')
        .replace(/\bHei!\s*/gi, '')
        .replace(/\bHello!\s*/gi, '');
};

module.exports = { init, processText };