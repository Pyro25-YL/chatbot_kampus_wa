const { processText } = require('./ai');
const { wrapSend } = require('./send_queue');
const { isAdminUser, getAdminListText, checkGroupHasAdmin } = require('./admin');
const pool = require('../lib/db'); // Import koneksi PostgreSQL Pool

// IMPORT MODUL LOGIC TERPISAH
const { handleAkademikLogic } = require('./logic_akademik');
const { handleChatLogic } = require('./logic_chat');

// IMPORT HELPER MENU
const { buildOnboardingText } = require('./menu');

// --- HELPER GRUP VIA POSTGRESQL ---
const getGroupSettings = async (chatId) => {
    try {
        const res = await pool.query('SELECT * FROM kelas WHERE group_id_wa = $1', [chatId]);
        return res.rows[0] || null;
    } catch (e) {
        return null;
    }
};

const updateOnboardingStatus = async (chatId, status = true) => {
    try {
        await pool.query(
            `UPDATE kelas SET onboarding_done = $2 WHERE group_id_wa = $1`,
            [chatId, status]
        );
    } catch (e) {
        console.error("❌ Error update onboarding:", e.message);
    }
};

// ============================================================
// 🔥 MAIN HANDLER START 🔥
// ============================================================
module.exports = async (msg, client) => {
    try {
        console.log("📹 [CCTV 1] Masuk ke handler.js...");
        
        // 1. SETUP VARIABEL DASAR
        let chat = await msg.getChat().catch(() => null);
        if (!chat && msg.from) {
            chat = await client.getChatById(msg.from).catch(() => null);
        }
        console.log(`📹 [CCTV 2] Status Chat: ${chat ? 'Berhasil Loaded' : 'Null/Gagal'}`);
        
        const contact = await msg.getContact().catch(() => null);
        
        // --- AMBIL NOMOR ASLI PENGIRIM ---
        let rawSender = msg.author || msg.from || "";
        let senderNumber = contact?.number || rawSender.split('@')[0].split(':')[0];

        const pesan = msg.body || ""; 
        const idGrup = chat ? chat.id._serialized : msg.from;
        
        // Cek admin berdasarkan database PostgreSQL
        const isAdmin = await isAdminUser(senderNumber);
        
        // Bersihkan teks
        let textClean = pesan.toLowerCase()
            .replace(/^[.!/#]\s*/, '') 
            .replace(/^(asep|min|p!)\s*/, '') 
            .replace(/@[\w.:@]+/g, '') 
            .trim();

        // Wrap reply
        msg.reply = wrapSend(msg.reply.bind(msg));
        if (chat && chat.sendMessage) {
            chat.sendMessage = wrapSend(chat.sendMessage.bind(chat));
        }

        // Ambil Pengaturan Kelas/Grup dari Database PostgreSQL
        let groupSettings = await getGroupSettings(idGrup);

        // 🔒 PROTEKSI GRUP: Pastikan grup memiliki setidaknya 1 Admin resmi
        if (chat && chat.isGroup) {
            const hasAdmin = await checkGroupHasAdmin(client, chat);
            if (!hasAdmin) {
                console.log(`⛔ [PROTEKSI] Pesan masuk di grup "${chat.name}" tanpa Admin resmi. Bot keluar otomatis...`);
                await chat.sendMessage('⛔ *PROTEKSI BOT AKTIF*\n\nBot mendeteksi tidak ada Admin resmi yang berada di dalam grup ini.\nBot akan keluar secara otomatis.').catch(() => {});
                await new Promise(r => setTimeout(r, 2000));
                await chat.leave().catch(() => {});
                return;
            }
        }

        // ============================================================
        // 🔒 FILTER TAG / REPLY
        // ============================================================
        const botIds = new Set([
            (client.info?.wid?.user || "").split(':')[0],
            (client.info?.lid?.user || "").split(':')[0],
            (client.info?.me?.user || "").split(':')[0],
            "209616550019256"
        ].filter(Boolean));

        let isTagged = false;
        const mentions = await msg.getMentions().catch(() => []);
        if (mentions.some(c => c.isMe)) isTagged = true;

        if (!isTagged) {
            isTagged = Array.from(botIds).some(id => msg.body.includes('@' + id));
        }

        let isReplyToBot = false;
        if (msg.hasQuotedMsg) {
            const rawData = msg._data || {};
            const rawParticipant = (
                rawData.quotedParticipant || 
                rawData.contextInfo?.participant || 
                ""
            ).split('@')[0].split(':')[0];

            const isRawFromMe = rawData.quotedMsg?.fromMe || rawData.contextInfo?.isSender || false;

            if (isRawFromMe || (rawParticipant && botIds.has(rawParticipant))) {
                isReplyToBot = true;
            } else {
                try {
                    const quotedMsg = await msg.getQuotedMessage().catch(() => null);
                    if (quotedMsg) {
                        const quotedSender = (quotedMsg.author || quotedMsg.from || "").split('@')[0].split(':')[0];
                        if (quotedMsg.fromMe || botIds.has(quotedSender)) {
                            isReplyToBot = true;
                        }
                    }
                } catch (e) {}
            }
        }

        let shouldRespond = false;
        const isGroupChat = chat ? chat.isGroup : msg.from.endsWith('@g.us');

        if (!isGroupChat) {
            shouldRespond = true; 
        } else {
            if (isTagged || isReplyToBot) shouldRespond = true;
            if (textClean.startsWith('tagall') || textClean.startsWith('totag')) shouldRespond = true;
            if (pesan.toLowerCase() === 'p' || pesan.startsWith('!') || textClean.startsWith('set kelas')) shouldRespond = true;
        }

        console.log(`📹 [CCTV 4] User Nomor: ${senderNumber} | isTagged: ${isTagged} | isReply: ${isReplyToBot} | shouldRespond: ${shouldRespond}`);
        
        if (!shouldRespond) return;

        // ============================================================
        // 🚨 ZONE 1: COMMAND MANUAL UTAMA (TAGALL & ADMIN)
        // ============================================================

        if (textClean.startsWith('tagall') || textClean.startsWith('totag')) {
            if (!isGroupChat) return msg.reply('❌ Khusus Grup!');
            
            try {
                let participants = [];
                if (chat && chat.participants && chat.participants.length > 0) {
                    participants = chat.participants;
                }

                if (participants.length === 0) {
                    try {
                        const fetchedChat = await client.getChatById(idGrup);
                        if (fetchedChat && fetchedChat.participants) {
                            participants = fetchedChat.participants;
                        }
                    } catch (e) {}
                }

                if (!participants || participants.length === 0) {
                    return await msg.reply("❌ Gagal mengambil daftar anggota grup dari WhatsApp.");
                }

                let pesanIsi = textClean.replace(/^(tagall|totag)/i, '').trim();
                let finalText = pesanIsi ? 
                    `📢 *PENGUMUMAN*\n\n"${pesanIsi}"\n\n_cc: All Members_` : 
                    "📢 *PANGGILAN WARGA*";

                let mentionsList = [];
                for (let p of participants) {
                    try {
                        let pId = p.id?._serialized || p.id;
                        if (pId) {
                            let c = await client.getContactById(pId).catch(() => null);
                            if (c) mentionsList.push(c);
                        }
                    } catch (e) {}
                }

                await client.sendMessage(idGrup, finalText, { mentions: mentionsList });
            } catch (errTag) {
                await msg.reply("❌ Gagal melakukan tagall.");
            }
            return;
        }

        // HAPUS TUGAS TERATAS (SQL UPDATE)
        if (pesan.startsWith('!hapus') && isAdmin) {
            const resDelete = await pool.query(
                `DELETE FROM tugas 
                 WHERE id = (
                     SELECT id FROM tugas WHERE chat_id = $1 ORDER BY id ASC LIMIT 1
                 ) RETURNING matkul`,
                [idGrup]
            );
            if (resDelete.rowCount === 0) return msg.reply("Tidak ada tugas.");
            return msg.reply(`🗑️ Tugas *${resDelete.rows[0].matkul}* dihapus.`);
        }
        
        // RESET JADWAL GRUP (SQL DELETE)
        if (pesan.startsWith('!resetjadwal') && isAdmin) {
            await pool.query(
                `DELETE FROM jadwal WHERE kelas_id = (SELECT id FROM kelas WHERE group_id_wa = $1)`,
                [idGrup]
            );
            return msg.reply("🗑️ Jadwal dibersihkan.");
        }

        if (textClean === 'admin' || textClean === 'siapa adminnya?' || textClean === 'list admin') {
            const teksAdmin = await getAdminListText();
            await msg.reply(teksAdmin);
            return; 
        }

        // ============================================================
        // 🧠 ZONE 2: AI PROCESSING & AUTO-SET KELAS
        // ============================================================
        if (chat && chat.sendStateTyping) {
            await chat.sendStateTyping().catch(() => null);
        }

        const result = await processText(textClean, idGrup);

        // 💥 EKSEKUSI SET KELAS (DIPANGGIL SEBELUM CEK ONBOARDING)
        if ((result && result.intent === 'kelas.set') || textClean.startsWith('set kelas')) {
            if (!isGroupChat) return msg.reply('❌ Perintah ini hanya bisa dijalankan di dalam grup WhatsApp!');

            let namaKelas = result?.entities?.find(e => e.entity === 'nama_kelas')?.option;
            if (!namaKelas) {
                namaKelas = textClean.replace(/^set kelas\s*/i, '').trim();
            }

            if (!namaKelas) return msg.reply('⚠️ Nama kelas tidak terdeteksi dengan jelas.');

            const cleanNamaKelas = namaKelas.trim();

            try {
                // 1. Cek apakah nama kelas sudah ada di database
                const checkKelas = await pool.query(
                    `SELECT * FROM kelas WHERE LOWER(nama_kelas) = LOWER($1)`,
                    [cleanNamaKelas]
                );

                if (checkKelas.rows.length > 0) {
                    // JIKA ADA: Hubungkan group_id_wa ke kelas tersebut
                    await pool.query(
                        `UPDATE kelas SET group_id_wa = $1, onboarding_done = true WHERE LOWER(nama_kelas) = LOWER($2)`,
                        [idGrup, cleanNamaKelas]
                    );
                    return await msg.reply(`✅ *Berhasil!* Grup WA ini dihubungkan dengan kelas *${checkKelas.rows[0].nama_kelas}*.`);
                } else {
                    // JIKA BELUM ADA: Auto Insert kelas baru ke database
                    const resInsert = await pool.query(
                        `INSERT INTO kelas (id, nama_kelas, group_id_wa, onboarding_done) 
                         VALUES (gen_random_uuid(), $1, $2, true) 
                         RETURNING *`,
                        [cleanNamaKelas, idGrup]
                    );
                    return await msg.reply(`🎉 *Kelas Baru Dibuat!* Berhasil mendaftarkan kelas *${resInsert.rows[0].nama_kelas}* dan menghubungkannya ke grup ini.`);
                }
            } catch (err) {
                console.error("❌ Error auto-set/insert kelas:", err.message);
                return await msg.reply('❌ Terjadi kesalahan database saat memproses kelas.');
            }
        }

        // ============================================================
        // 🔰 ZONE 3: ONBOARDING GRUP BARU (SETELAH CEK SET KELAS)
        // ============================================================
        if (isGroupChat && (!groupSettings || !groupSettings.onboarding_done)) {
            console.log("📹 [CCTV 5] Memulai Onboarding Baru...");
            const defaultKelas = groupSettings?.nama_kelas || null;
            await msg.reply(buildOnboardingText({ defaultKelas, isAdmin }));
            await updateOnboardingStatus(idGrup, true);
            return; 
        }

        // ============================================================
        // 🔄 ZONE 4: OVERRIDES INTENT & ROUTING LOGIC
        // ============================================================
        if (textClean.startsWith('tambah tugas')) {
            result.intent = 'tugas.tambah';
            result.score = 1.0; 
        } else if (
            textClean.includes('jadwal sementara') || 
            textClean.includes('jadwal tambahan') || 
            textClean.includes('jadwal pengganti') || 
            textClean.includes('ganti jadwal')
        ) {
            if (textClean.match(/(tambah|buat|ganti|pindah|alihkan)/)) {
                result.intent = 'jadwal_sementara.tambah';
            } else if (textClean.includes('hapus')) {
                result.intent = 'jadwal_sementara.hapus';
            } else if (textClean.includes('edit') || textClean.includes('ubah')) {
                result.intent = 'jadwal_sementara.edit';
            } else {
                result.intent = 'jadwal_sementara.lihat';
            }
            result.score = 1.0;
        } else if (textClean.match(/\bjadwal\b/i)) {
            if (textClean.match(/(tambah|input|buat)/i)) {
                result.intent = 'jadwal.tambah';
            } else if (textClean.match(/(hapus|del|remove)/i)) {
                result.intent = 'jadwal.hapus';
            } else if (textClean.match(/(edit|ubah|ganti)/i)) {
                result.intent = 'jadwal.edit';
            } else {
                result.intent = 'jadwal.lihat';
            }
            result.score = 1.0;
        } else if (textClean.match(/\bdosen\b/i)) {
            if (textClean.match(/^(tambah|input)/i)) result.intent = 'dosen.tambah';
            else if (textClean.match(/^(hapus|buang)/i)) result.intent = 'dosen.hapus';
            else if (textClean.match(/^(edit|ubah|ganti)/i)) result.intent = 'dosen.edit';
            else result.intent = 'dosen.lihat';
            result.score = 1.0;
        } else if (textClean.match(/\b(pj|penanggung jawab)\b/i)) {
            if (textClean.match(/^(tambah|input)/i)) result.intent = 'pj.tambah';
            else if (textClean.match(/^(hapus|buang)/i)) result.intent = 'pj.hapus';
            else if (textClean.match(/^(edit|ubah|ganti)/i)) result.intent = 'pj.edit';
            else result.intent = 'pj.lihat';
            result.score = 1.0;
        }

        if (result.intent === 'chat.ai' && result.answer) {
            return await msg.reply(result.answer);
        }

        // Context Data
        const contextData = {
            msg, textClean, pesan, isAdmin, pool, idGrup, result, client,
            senderNumber, groupSettings
        };

        // Router Logika
        const isAkademik = await handleAkademikLogic(result.intent, contextData);
        if (!isAkademik) {
            await handleChatLogic(result.intent, contextData);
        }

        console.log("✅ [CCTV 12] Eksekusi Handler Selesai Sempurna!");

    } catch (err) {
        console.error("❌ Error di handler:", err?.message || err);
    }
};