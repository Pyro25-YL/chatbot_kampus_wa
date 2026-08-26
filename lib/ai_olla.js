const fs = require('fs');
const { DAFTAR_ADMIN } = require('../config'); // 👤 IMPORT DAFTAR ADMIN DARI CONFIG

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

// Fungsi untuk menerjemahkan "Selasa" -> "5 Mei" (contoh)
const terjemahkanHari = (teks) => {
    let teksBaru = teks.toLowerCase();
    const now = new Date();

    // 1. Handle Besok & Lusa
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

    // 2. Handle Nama Hari (Senin, Selasa, dll)
    for (const [dayName, dayNum] of Object.entries(ID_DAYS)) {
        const regex = new RegExp(`\\b${dayName}\\b`, 'g');
        if (regex.test(teksBaru)) {
            const currentDay = now.getDay();
            let daysToAdd = dayNum - currentDay;

            // Kalau hari yang disebut udah lewat di minggu ini, tembak ke minggu depannya
            if (daysToAdd <= 0) {
                daysToAdd += 7;
            }

            let targetDate = new Date(now);
            targetDate.setDate(targetDate.getDate() + daysToAdd);
            
            const tglString = `${targetDate.getDate()} ${Object.keys(ID_MONTHS)[targetDate.getMonth()]}`;
            textBaru = teksBaru.replace(regex, tglString);
        }
    }
    return teksBaru;
};


// --- PENGATURAN OLLAMA ---
const OLLAMA_URL = 'http://127.0.0.1:11434/api/chat'; 
const OLLAMA_MODEL = 'qwen2.5:1.5b'; 

// --- SISTEM MEMORI (INGATAN BOT) ---
const chatHistory = {};
const MAX_HISTORY_LENGTH = 10; 

// 👤 FORMAT DAFTAR ADMIN UNTUK CONTEXT AI
let infoAdminSistem = "";
DAFTAR_ADMIN.forEach((noAdmin, index) => {
    infoAdminSistem += `- Wa.me/${noAdmin} (0${noAdmin.slice(2)})\n`;
});

const SYSTEM_PROMPT = `Lu adalah "Shion", teman tongkrongan WhatsApp yang asik dan nyambung diajak ngobrol.

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
${infoAdminSistem}

CONTOH BENAR JAWAB ADMIN:
User: "min siapa admin lu"
Shion: "Nih daftar admin gw bro, hubungin aja kalo ada eror:\n${infoAdminSistem.trim()}"

User: "minta kontak admin dong"
Shion: "Nih kontak admin gw:\n${infoAdminSistem.trim()}"`;


const init = async () => {
    console.log("🧠 MENGHUBUNGKAN KE OLLAMA...");
    try {
        const res = await fetch('http://127.0.0.1:11434/');
        if (res.ok) {
            console.log(`✅ OLLAMA READY! Menggunakan model: ${OLLAMA_MODEL}`);
        }
    } catch (err) { 
        console.error("⚠️ OLLAMA OFFLINE: Pastikan aplikasi Ollama sudah berjalan di server!"); 
    }
};

const chatWithOllama = async (prompt, sessionId = 'default') => {
    try {
        if (!chatHistory[sessionId]) {
            chatHistory[sessionId] = [
                { role: 'system', content: SYSTEM_PROMPT }
            ];
        }

        chatHistory[sessionId].push({ role: 'user', content: prompt });
        lastActive[sessionId] = Date.now();

        if (chatHistory[sessionId].length > MAX_HISTORY_LENGTH + 1) {
            chatHistory[sessionId].splice(1, 2); 
        }

        const response = await fetch(OLLAMA_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: OLLAMA_MODEL,
                messages: chatHistory[sessionId], 
                stream: false,
                options: {
                        temperature: 0.4,       
                        repeat_penalty: 1.3,    
                        top_p: 0.9,
                }
            })
        });

        if (!response.ok) throw new Error('Ollama Error');
        const data = await response.json();
        
        const aiReply = fixPronouns(data.message.content);

        const sentences = aiReply.split(/(?<=[.!?])\s+/);
        // Biarkan teks admin mengalir utuh jika mengandung format Wa.me/
        const shortReply = aiReply.includes('Wa.me/') ? aiReply : sentences.slice(0, 2).join(' ');

        chatHistory[sessionId].push({ role: 'assistant', content: shortReply });
        return shortReply;
    } catch (error) {
        console.error("❌ Ollama Error:", error.message);
        return "Aduh, otak AI-ku lagi pusing nih (Server Error). Coba bentar lagi ya bro!";
    }
};

const processText = async (textRaw, sessionId = 'default') => {
    if (!textRaw) return { intent: 'None', score: 0 };
    
    let text = terjemahkanHari(textRaw); 
    let cleanText = text.toLowerCase().trim();

    // ==========================================================
    // LAYER 1: HARD RULES & REGEX (ANTI LEKANG & CEPAT)
    // ==========================================================

    // 🔥 CEGAT SEMUA KALIMAT YANG MENGANDUNG KATA "ADMIN" 🔥
    if (cleanText.includes('admin')) {
        let balasanManual = `👥 *DAFTAR ADMIN BOT WA* 👥\n\n${infoAdminSistem}\n_Silakan hubungi salah satu admin di atas jika ada kendala sistem._`;
        return {
            intent: 'chat.ai',
            score: 1.0,
            answer: balasanManual
        };
    }

    if (['menu', 'help', 'bantuan', '!menu'].includes(cleanText)) {
        return { intent: 'menu.lihat', score: 1.0 };
    }
    if (cleanText.includes('tutorial') || cleanText.includes('panduan')) {
        return { intent: 'tutorial.lihat', score: 1.0 };
    }

    const isCheck = cleanText.match(/\b(lihat|cek|mana|daftar|list|info|tampil)\b/);
    const isTask = cleanText.match(/\b(tugas|pr|pekerjaan rumah)\b/);
    const isSchedule = cleanText.match(/\b(jadwal|matkul|kuliah|pelajaran)\b/);
    const isDelete = cleanText.match(/\b(hapus|delete|kelar|selesai|batal)\b/);
    const isEdit = cleanText.match(/\b(edit|ubah|ganti|update|koreksi)\b/);
    
    if (isTask && (isCheck || cleanText === 'tugas' || cleanText === 'list tugas')) {
        return { intent: 'tugas.lihat', score: 1.0 };
    }
    if (isSchedule && (isCheck || cleanText === 'jadwal' || cleanText === 'cek jadwal')) {
        return { intent: 'jadwal.lihat', score: 1.0 };
    }

    const isTambah = cleanText.includes('tambah') || cleanText.startsWith('catat') || cleanText.startsWith('input') || cleanText.includes('baru') || cleanText.startsWith('buat');
    const hasKeywords = cleanText.includes('matkul') && cleanText.includes('deadline');

    if ((isTambah && isTask) || hasKeywords) {
        const isi = text.replace(/.*?(tugas|pr|baru|buat|catat)\s*/i, '').trim();
        const deadlineMatch = text.match(/deadline\s+([\w\s,.:-]+)/i);
        let deadline = deadlineMatch ? deadlineMatch[1].trim() : null;
        if (deadline && deadline.includes(',')) deadline = deadline.split(',')[0].trim();

        return { 
            intent: 'tugas.tambah', score: 1.0, 
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

    if (isDelete && isSchedule) {
        const numbers = cleanText.match(/\d+/g);
        if (numbers) {
            return { intent: 'jadwal.hapus', score: 1.0, entities: [{ entity: 'nomor_jadwal', option: numbers }] };
        }
    }

    if (isTask && isEdit) {
        const numbers = cleanText.match(/\d+/);
        if (numbers) {
            return { intent: 'tugas.edit', score: 1.0, entities: [{ entity: 'nomor_tugas', option: numbers[0] }] };
        }
    }

    if (cleanText.includes('kirim') && cleanText.includes('dosen')) {
        return { intent: 'jadwal.kirim_dosen', score: 1.0 };
    }

    if (isSchedule && isEdit) {
        const numbers = cleanText.match(/\d+/);
        if (numbers) {
            return { intent: 'jadwal.edit', score: 1.0, entities: [{ entity: 'nomor_jadwal', option: numbers[0] }] };
        }
    }

    // ==========================================================
    // LAYER 2: OLLAMA SLM (PENGGANTI NODE-NLP & SMALL TALK)
    // ==========================================================
    
    const aiResponse = await chatWithOllama(text, sessionId);
    
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

const lastActive = {};

const cleanOldSessions = () => {
    const now = Date.now();
    for (const id in chatHistory) {
        if (now - (lastActive[id] || 0) > 60 * 60 * 1000) {
            delete chatHistory[id];
            delete lastActive[id];
            console.log(`🧹 Sesi ${id} dibersihkan dari memori`);
        }
    }
};

setInterval(cleanOldSessions, 30 * 60 * 1000);
module.exports = { init, processText };