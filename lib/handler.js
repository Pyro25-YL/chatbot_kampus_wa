const fs = require('fs');
const path = require('path');
const { bacaData, simpanData } = require('./database');
const { processText } = require('./ai');
const { wrapSend } = require('./send_queue');
const { DAFTAR_ADMIN } = require('../config');

// IMPORT MODUL LOGIC TERPISAH
const { handleAkademikLogic } = require('./logic_akademik');
const { handleChatLogic } = require('./logic_chat');

// IMPORT HELPER MENU
const {
    buildOnboardingText,
    normalizeMenuNavigation,
    trackMenuList,
    // Pastikan fungsi-fungsi menu lain diimport jika dipakai
    isMenuCategoryListText,
    isMenuCategoryDetailText,
    buildMenuCategoryListText,
    buildMenuCategoryDetailText,
    hasMenuState,
    goBackMenuView,
    normalizeMenuCategory,
    trackMenuDetail
} = require('./menu');

// --- HELPER SETTINGS GRUP (Ditaruh di LUAR export) ---
const GROUPS_FILE = path.join(__dirname, '..', 'akademik', 'groups.json');

const loadGroupSettings = () => {
    try {
        if (!fs.existsSync(GROUPS_FILE)) return {};
        return JSON.parse(fs.readFileSync(GROUPS_FILE, 'utf8'));
    } catch (e) {
        return {};
    }
};

const saveGroupSettings = (data) => {
    const dirPath = path.dirname(GROUPS_FILE);
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
    fs.writeFileSync(GROUPS_FILE, JSON.stringify(data, null, 2));
};

// ============================================================
// 🔥 MAIN HANDLER START 🔥
// ============================================================
module.exports = async (msg, client) => {
    try {
        // 1. SETUP VARIABEL DASAR
        const chat = await msg.getChat();
        const contact = await msg.getContact();
        const pesan = msg.body || ""; 
        const idGrup = chat.id._serialized;
        const isAdmin = DAFTAR_ADMIN.includes(contact.number);
        const myId = client.info.wid._serialized; // ID Bot
        
        // Bersihkan teks untuk AI processing nanti
        let textClean = pesan.toLowerCase()
            .replace(/^(asep|min|p!)\s*/, '') 
            .replace(/@[\w.:@]+/g, '') 
            .trim();

        // Wrap reply agar aman (antrian pesan)
        msg.reply = wrapSend(msg.reply.bind(msg));
        chat.sendMessage = wrapSend(chat.sendMessage.bind(chat));

        // Load Database Akademik
        let db = bacaData();
        if (!db[idGrup]) db[idGrup] = { nama: chat.name || 'Grup', tugas: [], jadwal: [],jadwal_sementara: [], dosen: [], pj: [] };
        // 2. (PENTING) FIX UNTUK GRUP LAMA
        // Jika grup sudah ada tapi belum punya 'jadwal_sementara', buatkan array kosong
        if (!db[idGrup].jadwal_sementara) {
            db[idGrup].jadwal_sementara = [];
        }
        if (!db[idGrup].dosen) db[idGrup].dosen = []; // <--- Tambahkan ini
        if (!db[idGrup].pj) db[idGrup].pj = [];

        // Load Group Settings (Onboarding/Kelas)
        let groupSettings = loadGroupSettings();

        
        // ============================================================
        // 🔒 FILTER TAG / REPLY (THE GATEKEEPER)
        // ============================================================
        
        // Cek Tag (Mention)
        const mentions = await msg.getMentions();
        const isTagged = mentions.some(c => c.id._serialized === myId);

        // Cek Reply
        let isReplyToBot = false;
        if (msg.hasQuotedMsg) {
            const quotedMsg = await msg.getQuotedMessage();
            if (quotedMsg.fromMe) isReplyToBot = true;
        }

        // Tentukan: Apakah Bot Harus Merespon?
        let shouldRespond = false;

        if (!chat.isGroup) {
            // A. Chat Pribadi (PC) -> SELALU RESPON
            shouldRespond = true; 
        } else {
            // B. Grup -> HANYA JIKA DI-TAG atau DI-REPLY
            if (isTagged || isReplyToBot) {
                shouldRespond = true;
            }

            // Pengecualian: Command TagAll (Biar admin tetap bisa pakai tanpa tag bot)
            if (pesan.toLowerCase().startsWith('tagall') || pesan.toLowerCase().startsWith('totag')) {
                shouldRespond = true;
            }
            
            // Pengecualian: Jika pesan diawali 'p' atau '!' (Opsional, hapus jika ingin ketat banget)
            if (pesan.toLowerCase() === 'p' || pesan.startsWith('!')) {
                shouldRespond = true;
            }
        }

        // 🛑 STOP DISINI JIKA TIDAK LOLOS FILTER
        if (!shouldRespond) {
            return; // Bot diam seribu bahasa
        }

        // ============================================================
        // 🚨 ZONE 1: COMMAND MANUAL (TAG ALL & ONBOARDING)
        // ============================================================

        // A. TAG ALL
        if (textClean.startsWith('tagall') || textClean.startsWith('totag')) {
            if (!chat.isGroup) return msg.reply('❌ Khusus Grup!');
            let pesanIsi = pesan.replace(/^(tagall|totag)/i, '').trim();
            let finalText = pesanIsi ? 
                `📢 *PENGUMUMAN* 📢\n\n"${pesanIsi}"\n\n_cc: All Members_` : 
                "📢 *PANGGILAN WARGA* 📢";
            
            let mentionsList = chat.participants.map(p => p.id._serialized);
            await chat.sendMessage(finalText, { mentions: mentionsList });
            return;
        }

        // B. ONBOARDING (Jika grup baru dan belum diseting)
        if (chat.isGroup && !groupSettings[idGrup]?.onboardingDone) {
            const defaultKelas = groupSettings[idGrup]?.kelas || null;
            await msg.reply(buildOnboardingText({ defaultKelas, isAdmin }));
            
            // Update status onboarding
            groupSettings[idGrup] = { ...(groupSettings[idGrup] || {}), onboardingDone: true };
            saveGroupSettings(groupSettings);
            return; // Stop setelah onboarding agar tidak lanjut ke AI
        }

        // C. MANUAL COMMAND: ADMIN ONLY (Hapus/Reset)
        if (pesan.startsWith('!hapus') && isAdmin) {
            if (db[idGrup].tugas.length === 0) return msg.reply("Tidak ada tugas.");
            const deleted = db[idGrup].tugas.shift(); 
            simpanData(db);
            return msg.reply(`🗑️ Tugas *${deleted.matkul}* dihapus.`);
        }
        
        if (pesan.startsWith('!resetjadwal') && isAdmin) {
             db[idGrup].jadwal = [];
             simpanData(db);
             return msg.reply("🗑️ Jadwal dibersihkan.");
        }

        // ============================================================
        // 🧠 ZONE 2: AI PROCESSING & LOGIC DISTRIBUTION
        // ============================================================
        
        // 1. Panggil AI untuk mendapatkan INTENT
        const result = await processText(textClean);

if (textClean.startsWith('tambah tugas')) {
            result.intent = 'tugas.tambah';
            result.score = 1.0; 
        } 
        // --- TAMBAHAN BARU ---
        else if (textClean.includes('jadwal sementara') || textClean.includes('jadwal tambahan')) {
            if (textClean.includes('tambah') || textClean.includes('buat')) {
                result.intent = 'jadwal_sementara.tambah';
            } else if (textClean.includes('hapus')) {
                result.intent = 'jadwal_sementara.hapus';
            } else {
                result.intent = 'jadwal_sementara.lihat';
            }
            result.score = 1.0;
        }
        // ---------------------
        else if (textClean.startsWith('tambah jadwal')) {
            result.intent = 'jadwal.tambah';
            result.score = 1.0;
        }
        // --- ROUTING MENU DOSEN ---
        else if (textClean.includes('dosen')) {
            if (textClean.match(/^(tambah|input)/)) result.intent = 'dosen.tambah';
            else if (textClean.match(/^(hapus|buang)/)) result.intent = 'dosen.hapus';
            else if (textClean.match(/^(edit|ubah|ganti)/)) result.intent = 'dosen.edit';
            else result.intent = 'dosen.lihat';
            result.score = 1.0;
        }
        // --- ROUTING MENU PJ ---
        else if (textClean.match(/\b(pj|penanggung jawab)\b/)) {
            if (textClean.match(/^(tambah|input)/)) result.intent = 'pj.tambah';
            else if (textClean.match(/^(hapus|buang)/)) result.intent = 'pj.hapus';
            else if (textClean.match(/^(edit|ubah|ganti)/)) result.intent = 'pj.edit';
            else result.intent = 'pj.lihat';
            result.score = 1.0;
        }
        

        // 3. Siapkan Context Data
        const contextData = {
            msg, textClean, pesan, isAdmin, db, idGrup, result, client,
            // Kirim fungsi helper setting grup ke logic lain jika butuh
            groupSettings: groupSettings[idGrup],
            updateGroupSettings: (updates) => {
                groupSettings[idGrup] = { ...(groupSettings[idGrup] || {}), ...updates };
                saveGroupSettings(groupSettings);
            }
        };
        

        // 4. Router Logika (Akademik vs Chat Biasa)
        // Karena kita sudah pakai filter 'shouldRespond' di atas, 
        // kita tidak perlu threshold tinggi-tinggi. Bot sudah pasti dipanggil.
        
        // A. Cek Logika Akademik (Tugas/Jadwal)
        const isAkademik = await handleAkademikLogic(result.intent, contextData);
        
        // B. Jika bukan Akademik, lempar ke Chat/Obrolan
        if (!isAkademik) {
            await handleChatLogic(result.intent, contextData);
        }

    } catch (err) {
        console.error("❌ Error di handler:", err);
    }
};