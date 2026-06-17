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
    isMenuCategoryListText,
    isMenuCategoryDetailText,
    buildMenuCategoryListText,
    buildMenuCategoryDetailText,
    hasMenuState,
    goBackMenuView,
    normalizeMenuCategory,
    trackMenuDetail
} = require('./menu');

// --- HELPER SETTINGS GRUP ---
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
        console.log("📹 [CCTV 1] Masuk ke handler.js...");
        
        // 1. SETUP VARIABEL DASAR
        const chat = await msg.getChat();
        console.log("📹 [CCTV 2] Berhasil getChat()...");
        
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

        console.log("📹 [CCTV 3] Membaca database...");
        // Load Database Akademik
        let db = bacaData();
        if (!db[idGrup]) db[idGrup] = { nama: chat.name || 'Grup', tugas: [], jadwal: [],jadwal_sementara: [], dosen: [], pj: [] };
        
        // 2. FIX UNTUK GRUP LAMA
        if (!db[idGrup].jadwal_sementara) db[idGrup].jadwal_sementara = [];
        if (!db[idGrup].dosen) db[idGrup].dosen = []; 
        if (!db[idGrup].pj) db[idGrup].pj = [];

        // Load Group Settings
        let groupSettings = loadGroupSettings();

        // ============================================================
        // 🔒 FILTER TAG / REPLY (FIX MULTI-DEVICE)
        // ============================================================
        
        let isTagged = false;
        
        // 1. Cek Tag (Mention) pakai sistem bawaan WhatsApp
        const mentions = await msg.getMentions();
        if (mentions.some(c => c.isMe)) {
            isTagged = true;
        }

        // 2. Fallback: Cek manual via Teks (Buang buntut ':xx' dari Multi-Device)
        const botNumberAsli = client.info.wid.user.split(':')[0];
        if (msg.body.includes('@' + botNumberAsli)) {
            isTagged = true;
        }

        let isReplyToBot = false;
        if (msg.hasQuotedMsg) {
            const quotedMsg = await msg.getQuotedMessage();
            if (quotedMsg.fromMe) isReplyToBot = true;
        }

        let shouldRespond = false;

        if (!chat.isGroup) {
            shouldRespond = true; 
        } else {
            if (isTagged || isReplyToBot) shouldRespond = true;

            if (pesan.toLowerCase().startsWith('tagall') || pesan.toLowerCase().startsWith('totag')) {
                shouldRespond = true;
            }
            if (pesan.toLowerCase() === 'p' || pesan.startsWith('!')) {
                shouldRespond = true;
            }
        }

        console.log(`📹 [CCTV 4] isTagged: ${isTagged} | isReply: ${isReplyToBot} | shouldRespond: ${shouldRespond}`);
        
        // 🛑 STOP DISINI JIKA TIDAK LOLOS FILTER
        if (!shouldRespond) return;

        // ============================================================
        // 🚨 ZONE 1: COMMAND MANUAL (TAG ALL & ONBOARDING)
        // ============================================================

        if (textClean.startsWith('tagall') || textClean.startsWith('totag')) {
            if (!chat.isGroup) return msg.reply('❌ Khusus Grup!');
            let pesanIsi = pesan.replace(/^(tagall|totag)/i, '').trim();
            let finalText = pesanIsi ? 
                `📢 *PENGUMUMAN* \n\n"${pesanIsi}"\n\n_cc: All Members_` : 
                "📢 *PANGGILAN WARGA*";
            
            let mentionsList = chat.participants.map(p => p.id._serialized);
            await chat.sendMessage(finalText, { mentions: mentionsList });
            return;
        }

        if (chat.isGroup && !groupSettings[idGrup]?.onboardingDone) {
            console.log("📹 [CCTV 5] Memulai Onboarding Baru...");
            const defaultKelas = groupSettings[idGrup]?.kelas || null;
            await msg.reply(buildOnboardingText({ defaultKelas, isAdmin }));
            groupSettings[idGrup] = { ...(groupSettings[idGrup] || {}), onboardingDone: true };
            saveGroupSettings(groupSettings);
            console.log("📹 [CCTV 5] Onboarding Selesai Dikirim.");
            return; 
        }

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

        if (textClean === 'admin' || textClean === '.admin' || textClean === 'siapa adminnya?' || textClean === 'list admin') {
            let teksAdmin = `👥 *DAFTAR ADMIN BOT WA* 👥\n\n`;
            
            DAFTAR_ADMIN.forEach((noAdmin, index) => {
                const nomorRapi = noAdmin.replace(/^62/, '0');
                teksAdmin += `${index + 1}. Wa.me/${noAdmin} (${nomorRapi})\n`;
            });

            teksAdmin += `\n_Silakan hubungi salah satu admin di atas jika ada kendala sistem._`;
            
            await msg.reply(teksAdmin);
            console.log("✅ [CCTV ADMIN] Daftar admin berhasil dikirim via Zone 1.");
            return; // 🛑 Stop agar tidak bocor ke AI/Ollama
        }

        // ============================================================
        // 🧠 ZONE 2: AI PROCESSING & LOGIC DISTRIBUTION
        // ============================================================
        
        // Beri indikator typing selagi AI/Sistem berpikir
        console.log("📹 [CCTV 6] Mengirim status Typing...");
        await chat.sendStateTyping();

        console.log(`📹 [CCTV 7] Menunggu balasan AI untuk teks: "${textClean}"...`);
        // 1. Panggil AI untuk mendapatkan INTENT
        const result = await processText(textClean);
        console.log("📹 [CCTV 8] Yeay! AI berhasil merespon:", result.intent);

        // --- MANUAL INTENT OVERRIDES ---
        if (textClean.startsWith('tambah tugas')) {
            result.intent = 'tugas.tambah';
            result.score = 1.0; 
        } else if (textClean.includes('jadwal sementara') || textClean.includes('jadwal tambahan')) {
            if (textClean.includes('tambah') || textClean.includes('buat')) result.intent = 'jadwal_sementara.tambah';
            else if (textClean.includes('hapus')) result.intent = 'jadwal_sementara.hapus';
            else result.intent = 'jadwal_sementara.lihat';
            result.score = 1.0;
        } else if (textClean.startsWith('tambah jadwal')) {
            result.intent = 'jadwal.tambah';
            result.score = 1.0;
        } else if (textClean.includes('dosen')) {
            if (textClean.match(/^(tambah|input)/)) result.intent = 'dosen.tambah';
            else if (textClean.match(/^(hapus|buang)/)) result.intent = 'dosen.hapus';
            else if (textClean.match(/^(edit|ubah|ganti)/)) result.intent = 'dosen.edit';
            else result.intent = 'dosen.lihat';
            result.score = 1.0;
        } else if (textClean.match(/\b(pj|penanggung jawab)\b/)) {
            if (textClean.match(/^(tambah|input)/)) result.intent = 'pj.tambah';
            else if (textClean.match(/^(hapus|buang)/)) result.intent = 'pj.hapus';
            else if (textClean.match(/^(edit|ubah|ganti)/)) result.intent = 'pj.edit';
            else result.intent = 'pj.lihat';
            result.score = 1.0;
        }

        // ============================================================
        // 🤖 EKSEKUSI BALASAN DARI OLLAMA (SLM)
        // ============================================================
        if (result.intent === 'chat.ai' && result.answer) {
            console.log("📹 [CCTV 9] Membalas chat pakai AI...");
            return await msg.reply(result.answer);
        }

        // 3. Siapkan Context Data untuk logic Akademik/Chat Biasa
        const contextData = {
            msg, textClean, pesan, isAdmin, db, idGrup, result, client,
            groupSettings: groupSettings[idGrup],
            updateGroupSettings: (updates) => {
                groupSettings[idGrup] = { ...(groupSettings[idGrup] || {}), ...updates };
                saveGroupSettings(groupSettings);
            }
        };

        // 4. Router Logika (Akademik vs Chat Biasa)
        console.log("📹 [CCTV 10] Masuk ke Router Logic Akademik...");
        const isAkademik = await handleAkademikLogic(result.intent, contextData);
        
        if (!isAkademik) {
            console.log("📹 [CCTV 11] Masuk ke Router Logic Chat biasa...");
            await handleChatLogic(result.intent, contextData);
        }

        console.log("✅ [CCTV 12] Eksekusi Handler Selesai Sempurna!");

    } catch (err) {
        console.error("❌ Error di handler:", err);
    }
};