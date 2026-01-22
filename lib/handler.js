const fs = require('fs');
const path = require('path');
const { bacaData, simpanData } = require('./database');
const { processText } = require('./ai');
const { replyAI, deteksiWaktu, formatTanggal, ambilData, toTitleCase, showTugasNatural } = require('./utils');
const { handleAkademikCommand, handleJadwalUjianSelection } = require('./akademik');
const { handleAiCommand, handleAiFollowUp } = require('./ai_openai');
const { wrapSend } = require('./send_queue');
const {
    buildMenuCategoryListText,
    buildMenuCategoryDetailText,
    normalizeMenuCategory,
    normalizeMenuNavigation,
    isMenuCategoryListText,
    isMenuCategoryDetailText,
    buildTutorialCategoryListText,
    buildTutorialCategoryDetailText,
    buildOnboardingText,
    normalizeTutorialCategory,
    isTutorialCategoryListText,
    isTutorialCategoryDetailText,
    trackMenuList,
    trackMenuDetail,
    trackTutorialList,
    trackTutorialDetail,
    clearTutorialState,
    getTutorialState,
    goBackTutorialView,
    hasTutorialState,
    goBackMenuView,
    hasMenuState
} = require('./menu');
const { DAFTAR_ADMIN } = require('../config');

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

const handleMenuCategorySelection = async (msg, quotedMsg, isAdmin, chatId) => {
    if (!quotedMsg || !quotedMsg.fromMe) return false;
    const quotedBody = quotedMsg.body || '';
    const isList = isMenuCategoryListText(quotedBody);
    const isDetail = isMenuCategoryDetailText(quotedBody);
    const input = (msg.body || '').trim();
    const navAction = normalizeMenuNavigation(input);
    const hasState = hasMenuState(chatId);

    if (!isList && !isDetail && !navAction) return false;
    if (!isList && !isDetail && navAction && !hasState) return false;

    if (navAction === 'exit') {
        await msg.reply(buildMenuCategoryListText());
        trackMenuList(chatId);
        return true;
    }
    if (navAction === 'back') {
        const view = goBackMenuView(chatId);
        if (view.type === 'detail') {
            await msg.reply(buildMenuCategoryDetailText(view.category, isAdmin));
        } else {
            await msg.reply(buildMenuCategoryListText());
        }
        return true;
    }

    if (!isList && !isDetail) return false;

    const category = normalizeMenuCategory(input);
    if (!category) {
        await msg.reply(buildMenuCategoryListText());
        trackMenuList(chatId);
        return true;
    }

    if (category === 'tutorial') {
        await msg.reply(buildTutorialCategoryListText());
        trackTutorialList(chatId);
        return true;
    }

    await msg.reply(buildMenuCategoryDetailText(category, isAdmin));
    trackMenuDetail(chatId, category);
    return true;
};

const handleTutorialCategorySelection = async (msg, quotedMsg, chatId) => {
    const input = (msg.body || '').trim();
    const navAction = normalizeMenuNavigation(input);
    const hasState = hasTutorialState(chatId);

    let quotedBody = '';
    if (quotedMsg && quotedMsg.fromMe) {
        quotedBody = quotedMsg.body || '';
    }
    const isList = isTutorialCategoryListText(quotedBody);
    const isDetail = isTutorialCategoryDetailText(quotedBody);

    if (!isList && !isDetail && !navAction) return false;
    if (!isList && !isDetail && navAction && !hasState) return false;

    if (navAction === 'exit') {
        clearTutorialState(chatId);
        await msg.reply(buildMenuCategoryListText());
        trackMenuList(chatId);
        return true;
    }
    if (navAction === 'back') {
        const tutorialState = getTutorialState(chatId);
        if ((tutorialState.stack || []).length <= 1) {
            clearTutorialState(chatId);
            await msg.reply(buildMenuCategoryListText());
            trackMenuList(chatId);
            return true;
        }
        const view = goBackTutorialView(chatId);
        if (view.type === 'detail') {
            await msg.reply(buildTutorialCategoryDetailText(view.category));
            trackTutorialDetail(chatId, view.category);
        } else {
            await msg.reply(buildTutorialCategoryListText());
            trackTutorialList(chatId);
        }
        return true;
    }

    if (!isList && !isDetail) return false;

    const category = normalizeTutorialCategory(input);
    if (!category) {
        await msg.reply(buildTutorialCategoryListText());
        trackTutorialList(chatId);
        return true;
    }

    await msg.reply(buildTutorialCategoryDetailText(category));
    trackTutorialDetail(chatId, category);
    return true;
};

module.exports = async (msg, client) => {
    try {
        const chat = await msg.getChat();
        const contact = await msg.getContact();
        const pesan = msg.body;
        const idGrup = chat.id._serialized;
        const isAdmin = DAFTAR_ADMIN.includes(contact.number);
        const senderName =
            contact.pushname || contact.name || contact.number || contact.id?.user || 'unknown';
        const senderId = contact.number || contact.id?.user || 'unknown';
        const chatName = chat.name || idGrup || 'unknown';
        const msgPreview = (pesan || '').replace(/\s+/g, ' ').slice(0, 240);
        console.log(
            `[MSG] from=${senderName} (${senderId}) chat=${chatName} isGroup=${!!chat.isGroup} text="${msgPreview}"`
        );

        msg.reply = wrapSend(msg.reply.bind(msg));
        chat.sendMessage = wrapSend(chat.sendMessage.bind(chat));

        // Load Database
        let db = bacaData();
        if (!db[idGrup]) db[idGrup] = { nama: chat.name || 'Grup', tugas: [], jadwal: [] };

        const groupSettings = loadGroupSettings();
        const getDefaultKelas = () => groupSettings[idGrup]?.kelas || null;
        const setDefaultKelas = (kelas) => {
            groupSettings[idGrup] = { ...(groupSettings[idGrup] || {}), kelas };
            saveGroupSettings(groupSettings);
        };
        const getGroupSettings = () => groupSettings[idGrup] || {};
        const updateGroupSettings = (updates) => {
            groupSettings[idGrup] = { ...(groupSettings[idGrup] || {}), ...updates };
            saveGroupSettings(groupSettings);
        };

        const myNumber = client.info.wid.user;
        const mentions = await msg.getMentions();
        const isMention = mentions.some((contact) => contact.number === myNumber);

        let isReplyBot = false;
        let quotedMsg = null;
        if (msg.hasQuotedMsg) {
            quotedMsg = await msg.getQuotedMessage();
            if (quotedMsg && (quotedMsg.fromMe || (quotedMsg.author && quotedMsg.author.includes(myNumber)))) {
                isReplyBot = true;
            }
        }

        const isDipanggil = ['bot', 'min', 'p!'].some((x) => pesan.toLowerCase().startsWith(x));
        const shouldRespond = isDipanggil || isMention || isReplyBot || pesan.startsWith('!');
        const groupState = groupSettings[idGrup] || {};

        if (chat.isGroup && shouldRespond && !groupState.onboardingDone) {
            await msg.reply(buildOnboardingText({ defaultKelas: getDefaultKelas(), isAdmin }));
            groupSettings[idGrup] = { ...groupState, onboardingDone: true };
            saveGroupSettings(groupSettings);
        }

        const userId = contact.number || contact.id?.user || 'user';
        const aiHandled = await handleAiCommand(msg, {
            chatId: idGrup,
            userId,
            client
        });
        if (aiHandled) return;

        const aiFollowHandled = await handleAiFollowUp(msg, {
            chatId: idGrup,
            userId,
            client,
            chat,
            contact,
            quotedMsg
        });
        if (aiFollowHandled) return;

        const akademikHandled = await handleAkademikCommand(msg, {
            isAdmin,
            adminContacts: DAFTAR_ADMIN,
            getDefaultKelas,
            setDefaultKelas,
            getGroupSettings,
            updateGroupSettings,
            chatId: idGrup,
            actorId: userId || 'unknown',
            actorName: contact.pushname || contact.name || '',
            chat,
            client,
            isGroup: !!chat.isGroup
        });
        if (akademikHandled) return;

        if (pesan.startsWith('.hidetag')) {
            if (!chat.isGroup) return msg.reply('Perintah ini hanya untuk grup.');
            if (!isAdmin) return msg.reply(replyAI('bukan_admin'));

            const raw = pesan.replace(/^\.hidetag\s*/i, '').trim();
            const text = raw || 'Hidetag';
            const mentions = await Promise.all(
                (chat.participants || []).map((p) =>
                    client.getContactById(p.id._serialized)
                )
            );
            await chat.sendMessage(text, { mentions });
            return;
        }

        // --- A. MANUAL COMMANDS (Hapus Tugas) ---
        if (pesan.startsWith('!hapus')) {
            if (!isAdmin) return msg.reply(replyAI('bukan_admin'));
            if (db[idGrup].tugas.length === 0) return msg.reply("Tidak ada tugas untuk dihapus.");
            const deleted = db[idGrup].tugas.shift();
            simpanData(db);
            return msg.reply(`🗑️ Tugas *${deleted.matkul}* berhasil dihapus oleh Admin.`);
        }
        
        // --- COMMAND HAPUS JADWAL (Tambahan) ---
        if (pesan.startsWith('!resetjadwal')) {
            if (!isAdmin) return msg.reply(replyAI('bukan_admin'));
            db[idGrup].jadwal = [];
            simpanData(db);
            return msg.reply("🗑️ Seluruh jadwal kuliah berhasil dihapus bersih.");
        }

        // --- B. TRIGGER CHECK ---
        const ujianSelectionHandled = await handleJadwalUjianSelection(
            msg,
            quotedMsg,
            isAdmin,
            idGrup,
            getDefaultKelas()
        );
        if (ujianSelectionHandled) return;

        const tutorialSelectionHandled = await handleTutorialCategorySelection(
            msg,
            quotedMsg,
            idGrup
        );
        if (tutorialSelectionHandled) return;

        const menuSelectionHandled = await handleMenuCategorySelection(
            msg,
            quotedMsg,
            isAdmin,
            idGrup
        );
        if (menuSelectionHandled) return;

        if (chat.isGroup && !shouldRespond) return;

        // Bersihkan teks
        let textClean = pesan.toLowerCase()
            .replace(/^(bot|min|p!)\s*/, '') 
            .replace(/@[\w.:@]+/g, '') 
            .trim();
        
        // Panggil AI
        const result = await processText(textClean);

        // --- C. EKSEKUSI INTENT ---
        const threshold = shouldRespond ? 0 : 0.6; 

        if (result.score > threshold || result.intent.includes('tugas') || result.intent.includes('jadwal') || shouldRespond) {
            
                switch (result.intent) {
                    case 'tutorial.lihat':
                        msg.reply(buildTutorialCategoryListText());
                        trackTutorialList(idGrup);
                        break;
                    case 'menu.lihat':
                        msg.reply(buildMenuCategoryListText());
                        trackMenuList(idGrup);
                        break;

                case 'tugas.tambah':
                    if (!isAdmin) return msg.reply(replyAI('bukan_admin'));
                    const waktuAI = deteksiWaktu(pesan);
                    if (waktuAI) {
                        const toleransi = new Date(); toleransi.setHours(toleransi.getHours() - 1);
                        if (waktuAI < toleransi) return msg.reply(replyAI('gagal_waktu', { tanggal: formatTanggal(waktuAI) }));

                        let matkul = ambilData(pesan, /tambah tugas\s+([^,]+)/i);
                        if (!matkul) matkul = textClean.split(' ').slice(0, 3).join(' '); 
                        let detail = ambilData(pesan, /\bdetail(?:nya)?\s+([^,]+)/i) || "Via Chat";
                        let tempat = ambilData(pesan, /\btempat\s+([^,]+)/i) || "-";
                        let format = ambilData(pesan, /\bformat\s+([^,]+)/i) || "Rapi";
                        const tglStr = formatTanggal(waktuAI);

                        db[idGrup].tugas.push({
                            matkul: toTitleCase(matkul),
                            detail: toTitleCase(detail),
                            tempat: toTitleCase(tempat),
                            format: toTitleCase(format),
                            deadline: tglStr
                        });
                        simpanData(db);
                        msg.reply(replyAI('sukses_tugas', { matkul: toTitleCase(matkul), deadline: tglStr }));
                    } else {
                        msg.reply(replyAI('bingung_format'));
                    }
                    break;

                case 'tugas.lihat':
                    showTugasNatural(msg, db[idGrup].tugas, textClean);
                    break;

                // ==========================================
// ==========================================
                // FITUR BARU: TAMBAH JADWAL (REVISI REGEX)
                // ==========================================
                case 'jadwal.tambah':
                    if (!isAdmin) return msg.reply(replyAI('bukan_admin'));

                    // PERBAIKAN: Regex menggunakan (?=...) agar berhenti saat ketemu kata kunci lain
                    // 1. Matkul: Ambil sampai ketemu kata dosen/hari/jam/akhir kalimat
                    const m_jadwal = ambilData(pesan, /matkul\s+(.+?)(?=\s+(?:dosen|hari|jam)|$)/i) || 
                                     ambilData(pesan, /jadwal\s+(.+?)(?=\s+(?:dosen|hari|jam)|$)/i);
                    
                    // 2. Dosen: Ambil sampai ketemu kata hari/jam/akhir kalimat
                    const d_jadwal = ambilData(pesan, /dosen\s+(.+?)(?=\s+(?:hari|jam)|$)/i) || "-";
                    
                    // 3. Hari: Ambil sampai ketemu kata jam/akhir kalimat
                    const h_jadwal = ambilData(pesan, /hari\s+(.+?)(?=\s+(?:jam)|$)/i);
                    
                    // 4. Jam: Ambil sisanya
                    const j_jadwal = ambilData(pesan, /jam\s+(.+?)(?=$)/i);

                    // Validasi Input
                    if (m_jadwal && h_jadwal && j_jadwal) {
                        db[idGrup].jadwal.push({
                            matkul: toTitleCase(m_jadwal),
                            dosen: toTitleCase(d_jadwal),
                            hari: toTitleCase(h_jadwal),
                            jam: j_jadwal
                        });
                        
                        // Urutkan jadwal berdasarkan Hari (Senin - Minggu)
                        const urutanHari = { "Senin":1, "Selasa":2, "Rabu":3, "Kamis":4, "Jumat":5, "Sabtu":6, "Minggu":7 };
                        db[idGrup].jadwal.sort((a,b) => (urutanHari[a.hari] || 8) - (urutanHari[b.hari] || 8));

                        simpanData(db);
                        msg.reply(`✅ *Jadwal Berhasil Disimpan!*\n\n📚 Matkul: ${toTitleCase(m_jadwal)}\n👨‍🏫 Dosen: ${toTitleCase(d_jadwal)}\n🗓 Hari: ${toTitleCase(h_jadwal)}\n⏰ Jam: ${j_jadwal}`);
                    } else {
                        msg.reply("⚠️ Format salah bos!\n\nContoh yang benar:\n_\"Tambah jadwal Matkul Algoritma Dosen Pak Budi Hari Senin Jam 08:00\"_");
                    }
                    break;

// ==========================================
                // UPDATE: LIHAT JADWAL (TAMPILAN LEBIH RAPI)
                // ==========================================
                case 'jadwal.lihat':
                    if (db[idGrup].jadwal.length === 0) return msg.reply("📅 Jadwal belum diisi admin. Minta admin ketik 'Tambah jadwal...' dulu.");
                    
                    let t = "📅 *JADWAL KULIAH*\n";
                    
                    let currentHari = "";
                    
                    db[idGrup].jadwal.forEach((x) => {
                        // Cek apakah ganti hari? Kalau iya, buat Header Hari baru
                        if (x.hari.toUpperCase() !== currentHari) {
                            t += `\n➖➖➖➖➖➖➖➖➖➖\n`;
                            t += `🗓️ *${x.hari.toUpperCase()}*\n`; 
                            currentHari = x.hari.toUpperCase();
                        }

                        // Baris 1: Jam & Matkul
                        t += `⏰ ${x.jam} | *${toTitleCase(x.matkul)}*\n`;
                        
                        // Baris 2: Dosen (Hanya tampil jika ada isinya & bukan "-")
                        if (x.dosen && x.dosen !== "-" && x.dosen.toLowerCase() !== "via chat") {
                            t += `   👨‍🏫 ${toTitleCase(x.dosen)}\n`;
                        }
                    });
                    
                    t += `➖➖➖➖➖➖➖➖➖➖`;
                    msg.reply(t);
                    break;

                default:
                    if (result.answer) msg.reply(result.answer);
                    else msg.reply("Hadir bos! Ada yang bisa dibantu? Ketik '!menu' kalau bingung. 🫡");
            }
        }
    } catch (err) {
        console.error("Error di handler:", err);
    }
};

