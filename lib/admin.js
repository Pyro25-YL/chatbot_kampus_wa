const pool = require('./db');

let cachedAdminList = [];
let lastFetched = 0;
const CACHE_TTL_MS = 30 * 1000; // Cache 30 detik agar cepat dan tetap realtime

/**
 * Mengambil daftar admin dari tabel database PostgreSQL
 */
async function getDaftarAdmin() {
    const now = Date.now();
    if (cachedAdminList.length > 0 && (now - lastFetched < CACHE_TTL_MS)) {
        return cachedAdminList;
    }
    try {
        const res = await pool.query('SELECT nama, no_hp FROM admin');
        if (res.rows.length > 0) {
            cachedAdminList = res.rows;
            lastFetched = now;
        }
        return cachedAdminList;
    } catch (e) {
        // Fallback jika query bermasalah
        return cachedAdminList;
    }
}

/**
 * Helper pencocokan nomor WhatsApp yang ketat dan presisi
 */
function isPhoneMatch(rawNum1, rawNum2) {
    if (!rawNum1 || !rawNum2) return false;
    let n1 = String(rawNum1).replace(/\D/g, '');
    let n2 = String(rawNum2).replace(/\D/g, '');
    // Nomor HP yang valid harus minimal 8 digit (mencegah '2', '3' mencocokkan nomor lain)
    if (n1.length < 8 || n2.length < 8) return false;

    if (n1.startsWith('0')) n1 = '62' + n1.slice(1);
    if (n2.startsWith('0')) n2 = '62' + n2.slice(1);

    return n1 === n2;
}

/**
 * Mengecek apakah pengirim pesan adalah Admin
 * @param {string} senderNumber - Nomor WA pengirim
 */
async function isAdminUser(senderNumber) {
    if (!senderNumber) return false;
    const admins = await getDaftarAdmin();
    return admins.some(a => isPhoneMatch(senderNumber, a.no_hp));
}

/**
 * Menghasilkan teks daftar admin untuk perintah "admin" / "list admin"
 */
async function getAdminListText() {
    const admins = await getDaftarAdmin();
    if (admins.length === 0) {
        return "⚠️ Belum ada data admin di tabel database.";
    }

    let teks = `👥 *DAFTAR ADMIN BOT WA* 👥\n\n`;
    admins.forEach((adm, index) => {
        let cleanNo = String(adm.no_hp).replace(/\D/g, '');
        if (cleanNo.startsWith('0')) cleanNo = '62' + cleanNo.slice(1);
        const format08 = cleanNo.replace(/^62/, '0');
        teks += `${index + 1}. *${adm.nama}*\n   📱 WA: Wa.me/${cleanNo} (${format08})\n`;
    });
    teks += `\n_Silakan hubungi salah satu admin di atas jika ada kendala sistem._`;
    return teks;
}

/**
 * Menghasilkan teks info admin untuk System Prompt AI
 */
async function getAdminPromptText() {
    const admins = await getDaftarAdmin();
    if (admins.length === 0) return "- Hubungi Admin Grup\n";

    let teks = "";
    admins.forEach(adm => {
        let cleanNo = String(adm.no_hp).replace(/\D/g, '');
        if (cleanNo.startsWith('0')) cleanNo = '62' + cleanNo.slice(1);
        const format08 = cleanNo.replace(/^62/, '0');
        teks += `- ${adm.nama}: Wa.me/${cleanNo} (${format08})\n`;
    });
    return teks;
}

/**
 * Mengecek apakah di dalam suatu grup terdapat setidaknya 1 Admin resmi
 * @param {object} client - WhatsApp client
 * @param {object|string} chatOrId - Objek Chat atau ID Grup
 */
async function checkGroupHasAdmin(client, chatOrId) {
    try {
        let chat = typeof chatOrId === 'object' ? chatOrId : await client.getChatById(chatOrId).catch(() => null);
        if (!chat || !chat.isGroup) return true;

        const admins = await getDaftarAdmin();
        if (admins.length === 0) return true;

        const participants = chat.participants || [];
        for (const p of participants) {
            let pNumber = (p.id?.user || '').replace(/\D/g, '');
            // Jika ID berbentuk LID panjang, resolve nomor aslinya
            if (pNumber.length > 13) {
                const contact = await client.getContactById(p.id?._serialized || p.id).catch(() => null);
                if (contact && contact.number) pNumber = contact.number.replace(/\D/g, '');
            }
            if (admins.some(adm => isPhoneMatch(pNumber, adm.no_hp))) {
                return true; // Ada minimal 1 admin resmi di grup
            }
        }
        return false; // Tidak ada admin sama sekali di dalam grup
    } catch (err) {
        return true; // Jangan auto-leave jika ada kendala koneksi sementara
    }
}

/**
 * Menunggu hingga WhatsApp Web selesai memuat data grup ke browser
 */
async function waitForChatsSync(client, maxWaitSec = 35) {
    const start = Date.now();
    while ((Date.now() - start) < maxWaitSec * 1000) {
        const groupCount = await client.pupPage.evaluate(() => {
            try {
                if (!window.Store || !window.Store.Chat) return 0;
                const models = window.Store.Chat.models || [];
                const grps = models.filter(c => c.isGroup || (c.id && c.id.server === 'g.us'));
                return grps.length;
            } catch (e) {
                return 0;
            }
        }).catch(() => 0);

        if (groupCount > 0) {
            // Berikan jeda 3 detik agar seluruh 18+ grup selesai dimuat ke memori
            await new Promise(r => setTimeout(r, 3000));
            return groupCount;
        }
        await new Promise(r => setTimeout(r, 1500));
    }
    return 0;
}

/**
 * Memindai seluruh grup yang diikuti bot dan otomatis keluar dari grup tanpa admin
 * @param {object} client - WhatsApp client
 */
async function auditAllGroups(client) {
    try {
        console.log('🔍 [AUDIT GRUP] Memeriksa keberadaan Admin resmi di seluruh grup...');
        
        // 1. Tunggu beberapa detik agar memori chat siap
        await new Promise(r => setTimeout(r, 4000));

        // 2. Ambil daftar admin dari PostgreSQL
        const admins = await getDaftarAdmin();

        // 3. Ambil data seluruh grup langsung dari memori WhatsApp Web (Anti Crash / Anti Error r: r)
        let groupList = [];
        for (let attempt = 1; attempt <= 10; attempt++) {
            groupList = await client.pupPage.evaluate(() => {
                try {
                    const store = window.Store;
                    if (!store || !store.Chat) return [];
                    const chats = typeof store.Chat.getModelsArray === 'function' 
                        ? store.Chat.getModelsArray() 
                        : (store.Chat.models || store.Chat._models || []);
                    
                    const groups = [];
                    for (const chat of chats) {
                        const isGroup = Boolean(chat.isGroup || (chat.id && chat.id.server === 'g.us'));
                        if (isGroup && !chat.isReadOnly) {
                            const participants = [];
                            if (chat.groupMetadata && chat.groupMetadata.participants) {
                                const pList = chat.groupMetadata.participants._models || chat.groupMetadata.participants.models || [];
                                for (const p of pList) {
                                    const wid = p.id?._serialized || p.id?.user || '';
                                    if (wid) participants.push(wid);
                                }
                            }
                            groups.push({
                                id: chat.id._serialized,
                                name: chat.formattedTitle || chat.name || 'Grup',
                                participants: participants
                            });
                        }
                    }
                    return groups;
                } catch (e) {
                    return [];
                }
            }).catch(() => []);

            if (groupList.length > 0) break;
            await new Promise(r => setTimeout(r, 2000));
        }

        console.log(`📋 Total grup terdeteksi: ${groupList.length}`);

        for (const grp of groupList) {
            let hasAdmin = false;
            let adminNameFound = "";

            // Cek langsung kecocokan nomor peserta dengan admin
            for (const pId of grp.participants) {
                const cleanP = pId.split('@')[0].split(':')[0].replace(/\D/g, '');
                const foundAdmin = admins.find(adm => isPhoneMatch(cleanP, adm.no_hp));
                if (foundAdmin) {
                    hasAdmin = true;
                    adminNameFound = foundAdmin.nama;
                    break;
                }
            }

            // Jika belum ketemu dan ada nomor berupa LID panjang (>13 digit), resolve ke nomor kontak
            if (!hasAdmin && grp.participants.length > 0) {
                for (const pId of grp.participants) {
                    const cleanP = pId.split('@')[0].split(':')[0].replace(/\D/g, '');
                    if (cleanP.length > 13) {
                        const contact = await client.getContactById(pId).catch(() => null);
                        const realNum = contact?.number ? contact.number.replace(/\D/g, '') : '';
                        if (realNum) {
                            const foundAdmin = admins.find(adm => isPhoneMatch(realNum, adm.no_hp));
                            if (foundAdmin) {
                                hasAdmin = true;
                                adminNameFound = foundAdmin.nama;
                                break;
                            }
                        }
                    }
                }
            }

            if (!hasAdmin) {
                console.log(`⚠️ [AUDIT] Grup "${grp.name}" (${grp.id}) TIDAK memiliki Admin resmi. Keluar otomatis...`);
                try {
                    const chatObj = await client.getChatById(grp.id).catch(() => null);
                    if (chatObj) {
                        await chatObj.sendMessage('⛔ *PROTEKSI BOT AKTIF*\n\nBot mendeteksi tidak ada Admin resmi terdaftar di grup ini. Bot keluar secara otomatis.').catch(() => {});
                    }
                    await new Promise(r => setTimeout(r, 2000));
                    await client.pupPage.evaluate(async (chatId) => {
                        try {
                            const chat = await window.WWebJS.getChat(chatId, { getAsModel: false });
                            if (chat && window.Store.GroupUtils) {
                                await window.Store.GroupUtils.sendExitGroup(chat);
                            }
                        } catch (e) {}
                    }, grp.id);
                    console.log(`👋 Berhasil keluar dari grup "${grp.name}".`);
                } catch (e) {
                    console.error(`❌ Gagal keluar dari "${grp.name}":`, e.message);
                }
            } else {
                console.log(`✅ [AUDIT] Grup "${grp.name}" AMAN (Ada Admin: ${adminNameFound}).`);
            }
        }
    } catch (e) {
        console.error('❌ Error saat audit grup:', e.message || e);
    }
}

module.exports = {
    getDaftarAdmin,
    isAdminUser,
    getAdminListText,
    getAdminPromptText,
    checkGroupHasAdmin,
    auditAllGroups
};
