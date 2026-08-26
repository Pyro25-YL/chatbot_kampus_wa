const fs = require('fs');
const { DAFTAR_ADMIN } = require('../config'); 
const pool = require('../lib/db');
require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');

// --- SETUP API KEYS DARI .ENV ---
const getKeys = (envName) => (process.env[envName] || "").split(',').map(k => k.trim()).filter(k => k);

const geminiKeys = getKeys('GEMINI_API_KEYS');
const deepseekKeys = getKeys('DEEPSEEK_API_KEYS');
const groqKeys = getKeys('GROQ_API_KEYS').length > 0 ? getKeys('GROQ_API_KEYS') : getKeys('GROK_API_KEYS');

const availableProviders = [];
if (geminiKeys.length > 0) availableProviders.push('gemini');
if (deepseekKeys.length > 0) availableProviders.push('deepseek');
if (groqKeys.length > 0) availableProviders.push('groq');

let currentAiIndex = 0; 
let keyTrackers = { gemini: 0, deepseek: 0, groq: 0 };

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

let infoAdminSistem = "";
DAFTAR_ADMIN.forEach((noAdmin) => {
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
${infoAdminSistem}`;

const init = async () => {
    console.log(`🧠 SISTEM ROLLING AI READY!`);
    console.log(`🔑 Tersedia: ${geminiKeys.length} Gemini | ${deepseekKeys.length} DeepSeek | ${groqKeys.length} Groq`);
};

// --- FUNGSI TEMBAK API ---
const askGemini = async (historyArr, apiKey) => {
    const genAI = new GoogleGenerativeAI(apiKey);
    const sysInstruction = historyArr.find(h => h.role === 'system')?.content || SYSTEM_PROMPT;
    const messages = historyArr.filter(h => h.role !== 'system').map(h => ({
        role: h.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: h.content }]
    }));
    
    const model = genAI.getGenerativeModel({ 
        model: "gemini-flash-lite-latest",
        systemInstruction: { role: "system", parts: [{ text: sysInstruction }] }
    });

    const result = await model.generateContent({ contents: messages });
    return result.response.text();
};

const askDeepSeek = async (historyArr, apiKey) => {
    const response = await axios.post(
        'https://api.deepseek.com/chat/completions',
        { model: "deepseek-v4-flash", messages: historyArr, temperature: 0.4 },
        { headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' } }
    );
    return response.data.choices[0].message.content;
};

const askGroq = async (historyArr, apiKey) => {
    const response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        { 
            model: "llama-3.3-70b-versatile",
            messages: historyArr, 
            temperature: 0.4 
        },
        { headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' } }
    );
    return response.data.choices[0].message.content;
};

// --- ENGINE UTAMA MULTI-KEY AI ---
const chatWithAI = async (prompt, sessionId = 'default') => {
    if (availableProviders.length === 0) {
        return "⚠️ Bro, API Key di file .env lu kosong semua nih. Cek lagi ya!";
    }

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

        const currentHistory = [
            { role: 'system', content: SYSTEM_PROMPT },
            ...dbHistory,
            { role: 'user', content: prompt }
        ];

        await pool.query(
            `INSERT INTO chat_history (session_id, role, content) VALUES ($1, $2, $3)`,
            [sessionId, 'user', prompt]
        );

        let attempts = 0;
        let aiReply = "";
        let maxAttempts = availableProviders.length * 3;

        while (attempts < maxAttempts) {
            const provider = availableProviders[currentAiIndex];
            let activeKey = "";
            let keyIndex = 0;

            if (provider === 'gemini') {
                keyIndex = keyTrackers.gemini;
                activeKey = geminiKeys[keyIndex];
                keyTrackers.gemini = (keyTrackers.gemini + 1) % geminiKeys.length;
            } else if (provider === 'deepseek') {
                keyIndex = keyTrackers.deepseek;
                activeKey = deepseekKeys[keyIndex];
                keyTrackers.deepseek = (keyTrackers.deepseek + 1) % deepseekKeys.length;
            } else if (provider === 'groq') {
                keyIndex = keyTrackers.groq;
                activeKey = groqKeys[keyIndex];
                keyTrackers.groq = (keyTrackers.groq + 1) % groqKeys.length;
            }

            currentAiIndex = (currentAiIndex + 1) % availableProviders.length;

            try {
                if (provider === 'gemini') aiReply = await askGemini(currentHistory, activeKey);
                else if (provider === 'deepseek') aiReply = await askDeepSeek(currentHistory, activeKey);
                else if (provider === 'groq') aiReply = await askGroq(currentHistory, activeKey);
                
                break;
            } catch (err) {
                attempts++;
            }
        }

        if (attempts >= maxAttempts) throw new Error("Semua API Key Limit/Error!");

        aiReply = fixPronouns(aiReply);
        const sentences = aiReply.split(/(?<=[.!?])\s+/);
        const shortReply = aiReply.includes('Wa.me/') ? aiReply : sentences.slice(0, 2).join(' ');

        await pool.query(
            `INSERT INTO chat_history (session_id, role, content) VALUES ($1, $2, $3)`,
            [sessionId, 'assistant', shortReply]
        );

        return shortReply;
    } catch (error) {
        return "Waduh, nyawa AI gw lagi limit semua bro! Coba ntar lagi ya.";
    }
};

// --- HELPER NLU INTENT & ENTITY PARSER VIA MULTI-AI ---
const askLLMForJSON = async (prompt) => {
    if (availableProviders.length === 0) return null;
    let attempts = 0;
    let maxAttempts = availableProviders.length * 2;

    while (attempts < maxAttempts) {
        const provider = availableProviders[currentAiIndex];
        let activeKey = "";
        if (provider === 'gemini') {
            activeKey = geminiKeys[keyTrackers.gemini];
            keyTrackers.gemini = (keyTrackers.gemini + 1) % geminiKeys.length;
        } else if (provider === 'deepseek') {
            activeKey = deepseekKeys[keyTrackers.deepseek];
            keyTrackers.deepseek = (keyTrackers.deepseek + 1) % deepseekKeys.length;
        } else if (provider === 'groq') {
            activeKey = groqKeys[keyTrackers.groq];
            keyTrackers.groq = (keyTrackers.groq + 1) % groqKeys.length;
        }

        currentAiIndex = (currentAiIndex + 1) % availableProviders.length;

        try {
            if (provider === 'gemini') {
                const genAI = new GoogleGenerativeAI(activeKey);
                const model = genAI.getGenerativeModel({ 
                    model: "gemini-flash-lite-latest",
                    generationConfig: { responseMimeType: "application/json" }
                });
                const res = await model.generateContent(prompt);
                return JSON.parse(res.response.text());
            } else if (provider === 'groq') {
                const res = await axios.post(
                    'https://api.groq.com/openai/v1/chat/completions',
                    { 
                        model: "llama-3.3-70b-versatile",
                        messages: [{ role: "user", content: prompt }],
                        response_format: { type: "json_object" },
                        temperature: 0.1
                    },
                    { headers: { 'Authorization': `Bearer ${activeKey}`, 'Content-Type': 'application/json' } }
                );
                return JSON.parse(res.data.choices[0].message.content);
            } else if (provider === 'deepseek') {
                const res = await axios.post(
                    'https://api.deepseek.com/chat/completions',
                    { 
                        model: "deepseek-v4-flash",
                        messages: [{ role: "user", content: prompt }],
                        response_format: { type: "json_object" },
                        temperature: 0.1
                    },
                    { headers: { 'Authorization': `Bearer ${activeKey}`, 'Content-Type': 'application/json' } }
                );
                return JSON.parse(res.data.choices[0].message.content);
            }
        } catch (e) {
            attempts++;
        }
    }
    return null;
};

const parseIntentWithAI = async (text) => {
    try {
        const prompt = `
Kamu adalah modul NLU (Natural Language Understanding) cerdas untuk Bot Asisten Kampus WhatsApp.
Pahami konteks dan maksud percakapan pengguna bahasa Indonesia (formal, gaul, santai, singkatan, typo wajar, atau celetukan).

Tentukan INTENT yang paling tepat:
- "jadwal.lihat": Menanyakan, melihat, memeriksa, atau meminta daftar jadwal kuliah reguler/rutin (contoh: "jadwal woi", "ya jadwal", "mana jadwalnya", "spill jadwal", "besok kuliah apa", "jadwal kuliah hari rabu", "jadwal").
- "jadwal.tambah": Menambahkan/membuat jadwal kuliah baru.
- "jadwal.edit": Mengubah atau mengoreksi jadwal kuliah yang sudah ada (misal: "edit jadwal 1", "ubah jadwal 2").
- "jadwal.hapus": Menghapus jadwal kuliah.
- "jadwal_sementara.lihat": Melihat jadwal kelas pengganti / sementara / tambahan.
- "jadwal_sementara.tambah": Menambah jadwal kelas pengganti / sementara / tambahan.
- "jadwal_sementara.edit": Mengubah jadwal kelas pengganti / sementara.
- "jadwal_sementara.hapus": Menghapus jadwal kelas pengganti / sementara.
- "tugas.lihat": Melihat / cek daftar tugas atau PR perkuliahan.
- "tugas.tambah": Menambah / mencatat tugas baru.
- "tugas.edit": Mengubah rincian tugas.
- "tugas.hapus_confirm": Menghapus semua tugas.
- "tugas.hapus_pilih": Menghapus nomor tugas tertentu (misal: "tugas 1 kelar").
- "dosen.lihat": Melihat daftar dosen atau kontak dosen.
- "dosen.tambah": Menambah data dosen.
- "dosen.edit": Mengubah data dosen.
- "dosen.hapus": Menghapus data dosen.
- "pj.lihat": Melihat daftar Penanggung Jawab (PJ) matkul.
- "pj.tambah": Menambah data PJ matkul.
- "pj.edit": Mengubah data PJ matkul.
- "pj.hapus": Menghapus data PJ matkul.
- "kelas.set": Mendaftarkan / menghubungkan grup WA ke kelas tertentu.
- "menu.lihat": Meminta menu, panduan, tutorial, atau bantuan.
- "chat.ai": Obrolan umum santai, sapaan, curhat, bercanda, yang BUKAN permintaan perintah fitur di atas.

Kembalikan HANYA JSON:
{
  "intent": "nama.intent",
  "matkul": "nama matkul atau null",
  "dosen": "nama dosen atau null",
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

    // 2. CEK APAKAH MENGANDUNG KATA KUNCI AKADEMIK UNTUK NLU PARSER
    const hasAcademicKeywords = cleanText.match(/\b(jadwal|matkul|kuliah|pelajaran|dosen|tugas|pr|deadline|kelas|grup|set kelas|ruangan|ruang|pengganti|sementara|pj)\b/i);

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

    // 3. LAYER 2: LLM CHATBOT (Langsung 1x Tembak untuk obrolan santai, super cepat)
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