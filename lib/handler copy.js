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

// --- HELPER SETTINGS GRUP ---
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

// --- HANDLER MENU INTERAKTIF ---
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
        // Jika input salah tapi konteks menu aktif, kasih menu utama lagi
        if (isList) {
             await msg.reply(buildMenuCategoryListText());
             trackMenuList(chatId);
             return true;
        }
        return false; 
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
        if(isList) {
            await msg.reply(buildTutorialCategoryListText());
            trackTutorialList(chatId);
            return true;
        }
        return false;
    }

    await msg.reply(buildTutorialCategoryDetailText(category));
    trackTutorialDetail(chatId, category);
    return true;
};

// ============================================================
// 🔥 MAIN HANDLER START 🔥
// ============================================================
module.exports = async (msg, client) => {
    try {
        const chat = await msg.getChat();
        const contact = await msg.getContact();
        const pesan = msg.body; 
        const idGrup = chat.id._serialized;
        const isAdmin = DAFTAR_ADMIN.includes(contact.number);
        const myNumber = client.info.wid.user; 
        
        // 1. BERSIHKAN TEKS
        let textClean = pesan.toLowerCase()
            .replace(/^(asep|min|p!)\s*/, '') 
            .replace(/@[\w.:@]+/g, '') 
            .trim();

        const senderName = contact.pushname || contact.name || contact.number || 'unknown';
        const senderId = contact.number || 'unknown';
        
        // Wrap reply agar aman (queue)
        msg.reply = wrapSend(msg.reply.bind(msg));
        chat.sendMessage = wrapSend(chat.sendMessage.bind(chat));

        // Load Database
        let db = bacaData();
        if (!db[idGrup]) db[idGrup] = { nama: chat.name || 'Grup', tugas: [], jadwal: [] };

        // --- SETUP GROUP SETTINGS ---
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

        // ============================================================
        // 🚨 ZONE 1: COMMAND MANUAL & PRIORITAS TINGGI
        // ============================================================

        // A. TAG ALL / TOTAG
        const firstWord = pesan.split(' ')[0].toLowerCase(); 
        const tagKeywords = ['tagall', 'totag', 'everyone', 'p'];

        if (tagKeywords.includes(firstWord) || textClean.startsWith('tagall')) {
            if (!chat.isGroup) return msg.reply('❌ Fitur ini khusus di dalam Grup bos!');
            
            let pesanIsi = pesan.slice(firstWord.length).trim();
            let finalText = pesanIsi ? 
                `📢 *PENGUMUMAN PENTING!* 📢\n\n"${pesanIsi}"\n\n_cc: All Members_` : 
                "📢 *PANGGILAN KEPADA SELURUH WARGA* 📢";

            let mentions = chat.participants.map(p => p.id._serialized);
            try {
                await chat.sendMessage(finalText, { mentions: mentions });
            } catch (err) {
                console.error(`❌ [TAGALL ERROR]`, err);
            }
            return; 
        }

        // B. DETEKSI APAKAH BOT HARUS MERESPON
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

        const isDipanggil = ['bot', 'min', 'p!', 'asep'].some((x) => pesan.toLowerCase().startsWith(x));
        const isCommandMode = ['tambah', 'hapus', 'lihat', 'cek', 'jadwal'].some(x => textClean.startsWith(x));
        const shouldRespond = isDipanggil || isMention || isReplyBot || pesan.startsWith('!') || isCommandMode;
        
        // Onboarding Check
        const groupState = groupSettings[idGrup] || {};
        if (chat.isGroup && shouldRespond && !groupState.onboardingDone) {
            await msg.reply(buildOnboardingText({ defaultKelas: getDefaultKelas(), isAdmin }));
            groupSettings[idGrup] = { ...groupState, onboardingDone: true };
            saveGroupSettings(groupSettings);
        }

        // ============================================================
        // 🚨 ZONE 2: INTERAKTIF MENU & MODUL LAIN
        // ============================================================

        // 1. Cek Interaksi Jadwal Ujian
        const ujianSelectionHandled = await handleJadwalUjianSelection(msg, quotedMsg, isAdmin, idGrup, getDefaultKelas());
        if (ujianSelectionHandled) return;

        // 2. Cek Interaksi Tutorial
        const tutorialSelectionHandled = await handleTutorialCategorySelection(msg, quotedMsg, idGrup);
        if (tutorialSelectionHandled) return;

        // 3. Cek Interaksi Menu Utama
        const menuSelectionHandled = await handleMenuCategorySelection(msg, quotedMsg, isAdmin, idGrup);
        if (menuSelectionHandled) return;

        // 4. Cek Modul AI Percakapan & Follow Up
        const userId = contact.number || contact.id?.user || 'user';
        
        const aiHandled = await handleAiCommand(msg, { chatId: idGrup, userId, client });
        if (aiHandled) return;

        const aiFollowHandled = await handleAiFollowUp(msg, { chatId: idGrup, userId, client, chat, contact, quotedMsg });
        if (aiFollowHandled) return;

        // 5. Cek Modul Akademik (Lainnya)
        const akademikHandled = await handleAkademikCommand(msg, {
            isAdmin,
            adminContacts: DAFTAR_ADMIN,
            getDefaultKelas,
            setDefaultKelas,
            getGroupSettings,
            updateGroupSettings,
            chatId: idGrup,
            actorId: userId,
            actorName: senderName,
            chat,
            client,
            isGroup: !!chat.isGroup
        });
        if (akademikHandled) return;

        // --- ADMIN COMMANDS MANUAL ---
        if (pesan.startsWith('!hapus')) {
            if (!isAdmin) return msg.reply(replyAI('bukan_admin'));
            if (db[idGrup].tugas.length === 0) return msg.reply("Tidak ada tugas untuk dihapus.");
            const deleted = db[idGrup].tugas.shift(); 
            simpanData(db);
            return msg.reply(`🗑️ Tugas *${deleted.matkul}* berhasil dihapus.`);
        }
        
        if (pesan.startsWith('!resetjadwal')) {
            if (!isAdmin) return msg.reply(replyAI('bukan_admin'));
            db[idGrup].jadwal = [];
            simpanData(db);
            return msg.reply("🗑️ Seluruh jadwal kuliah berhasil dihapus bersih.");
        }

        // ============================================================
        // 🧠 ZONE 3: AI PROCESSING & LOGIC UTAMA
        // ============================================================
        
        if (chat.isGroup && !shouldRespond) return;

        // Panggil AI
        const result = await processText(textClean);
        
        // 🔥 MANUAL OVERRIDE (PAKSAAN)
        if (textClean.startsWith('tambah tugas')) {
            result.intent = 'tugas.tambah';
            result.score = 1.0; 
        } else if (textClean.startsWith('tambah jadwal')) {
            result.intent = 'jadwal.tambah';
            result.score = 1.0;
        }

        const menuKeywords = ['menu', '!menu', '/menu', '.menu', 'info', 'help', 'tolong'];
        if (menuKeywords.includes(firstWord) || textClean === 'menu') {
            result.intent = 'menu.lihat';
            result.score = 1.0;
        }

        const threshold = shouldRespond ? 0 : 0.6; 

        if (result.score > threshold || result.intent.includes('tugas') || result.intent.includes('jadwal') || shouldRespond) {
            
            switch (result.intent) {
                // --- MENU & TUTORIAL ---
                case 'menu.lihat':
                    msg.reply(buildMenuCategoryListText());
                    trackMenuList(idGrup);
                    break;
                
                case 'tutorial.lihat':
                    msg.reply(buildTutorialCategoryListText());
                    trackTutorialList(idGrup);
                    break;

                // --- TUGAS ---
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
                        msg.reply("⚠️ Format tanggal tidak terbaca. Coba: 'Tambah tugas MTK deadline besok jam 10'");
                    }
                    break;

                case 'tugas.lihat':
                    showTugasNatural(msg, db[idGrup].tugas, textClean);
                    break;

                case 'tugas.hapus_pilih':
                    if (!isAdmin) return msg.reply(replyAI('bukan_admin'));
                    let entityNomor = result.entities.find(e => e.entity === 'nomor_tugas');
                    if (!entityNomor || !entityNomor.option) return msg.reply("⚠️ Sebutkan nomor tugas yang mau dihapus. Contoh: 'Hapus tugas 1'");

                    let nomorHapus = entityNomor.option.map(n => parseInt(n));
                    let tugasList = db[idGrup].tugas;

                    if (tugasList.length === 0) return msg.reply("Zonk! Gak ada tugas yang bisa dihapus.");

                    let sisaTugas = tugasList.filter((val, index) => !nomorHapus.includes(index + 1));
                    
                    if (sisaTugas.length === tugasList.length) {
                        msg.reply("⚠️ Nomor tugas tidak ditemukan/salah.");
                    } else {
                        let jumlahDihapus = tugasList.length - sisaTugas.length;
                        db[idGrup].tugas = sisaTugas;
                        simpanData(db);
                        msg.reply(`✅ Berhasil menghapus ${jumlahDihapus} tugas.`);
                    }
                    break;
                
                case 'tugas.hapus_confirm':
                     if (!isAdmin) return msg.reply(replyAI('bukan_admin'));
                     msg.reply("⚠️ Untuk menghapus, sebutkan nomornya. Contoh: *'Hapus tugas 1'* atau *'Hapus tugas 1, 2'*");
                     break;

                // --- JADWAL ---
                case 'jadwal.tambah':
                    if (!isAdmin) return msg.reply(replyAI('bukan_admin'));

                    const m_jadwal = ambilData(pesan, /matkul\s+(.+?)(?=\s+(?:dosen|hari|jam)|$)/i) || 
                                     ambilData(pesan, /jadwal\s+(.+?)(?=\s+(?:dosen|hari|jam)|$)/i);
                    const d_jadwal = ambilData(pesan, /dosen\s+(.+?)(?=\s+(?:hari|jam)|$)/i) || "-";
                    const h_jadwal = ambilData(pesan, /hari\s+(.+?)(?=\s+(?:jam)|$)/i);
                    const j_jadwal = ambilData(pesan, /jam\s+(.+?)(?=$)/i);

                    if (m_jadwal && h_jadwal && j_jadwal) {
                        db[idGrup].jadwal.push({
                            matkul: toTitleCase(m_jadwal),
                            dosen: toTitleCase(d_jadwal),
                            hari: toTitleCase(h_jadwal),
                            jam: j_jadwal
                        });
                        
                        const urutanHari = { "Senin":1, "Selasa":2, "Rabu":3, "Kamis":4, "Jumat":5, "Sabtu":6, "Minggu":7 };
                        db[idGrup].jadwal.sort((a,b) => (urutanHari[a.hari] || 8) - (urutanHari[b.hari] || 8));

                        simpanData(db);
                        msg.reply(`✅ *Jadwal Disimpan!* ${toTitleCase(m_jadwal)} (${toTitleCase(h_jadwal)} ${j_jadwal})`);
                    } else {
                        msg.reply("⚠️ Format salah. Contoh: 'Tambah jadwal Matkul A Dosen B Hari Senin Jam 08:00'");
                    }
                    break;

                case 'jadwal.lihat':
                    if (db[idGrup].jadwal.length === 0) return msg.reply("📅 Jadwal kosong.");
                    let t = "📅 *JADWAL KULIAH*\n";
                    let currentHari = "";
                    db[idGrup].jadwal.forEach((x) => {
                        if (x.hari.toUpperCase() !== currentHari) {
                            t += `\n🗓️ *${x.hari.toUpperCase()}*\n`; 
                            currentHari = x.hari.toUpperCase();
                        }
                        t += `⏰ ${x.jam} | ${toTitleCase(x.matkul)}\n`;
                    });
                    msg.reply(t);
                    break;

                // --- DEFAULT ---
                default:
                    if (result.answer) msg.reply(result.answer);
                    else msg.reply("Hadir bos! Ada yang bisa dibantu? Ketik 'Menu' kalau bingung. 🫡");
                    break;
            }
        }
    } catch (err) {
        console.error("Error di handler:", err);
    }
};