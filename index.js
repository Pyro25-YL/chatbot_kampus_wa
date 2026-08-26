const { Client, LocalAuth } = require('whatsapp-web.js');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');
const OtakAI = require('./lib/ai'); 
const handleMessage = require('./lib/handler');
const { startCron } = require('./lib/cron');
const { isAdminUser, auditAllGroups, checkGroupHasAdmin } = require('./lib/admin');

// --- 1. IMPORT HANDLER REMINDER DOSEN ---
const { handleDosenResponse } = require('./lib/reminder'); 

// --- 2. RESOLVER PATH BROWSER (KHUSUS GOOGLE CHROME) ---
function resolveBrowserPath() {
    const candidates = [
        process.env.CHROME_PATH, 
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', 
        process.env.LOCALAPPDATA 
            ? path.join(process.env.LOCALAPPDATA, 'Google\\Chrome\\Application\\chrome.exe') 
            : null,
        '/usr/bin/google-chrome', 
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' 
    ].filter(Boolean);

    for (const p of candidates) {
        if (p && fs.existsSync(p)) return p;
    }
    return null;
}

const browserPath = resolveBrowserPath();
if (browserPath) {
    console.log('✅ Google Chrome ditemukan:', browserPath);
} else {
    console.error('❌ Google Chrome tidak ditemukan! Pastikan Chrome sudah terinstall.');
    process.exit(1);
}

// --- 3. INISIALISASI CLIENT ---
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        executablePath: browserPath,
        headless: false, 
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox', 
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas', 
            '--no-first-run', 
            '--no-zygote',
            '--disable-gpu'
        ],
        timeout: 60000, 
    },
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
    }
});

// --- 4. FIX CRASH WA WEB ---
const originalSendMessage = client.sendMessage.bind(client);
client.sendMessage = (chatId, content, options) => {
    const normalizedOptions = options && typeof options === 'object' ? options : {};
    const mergedOptions = Object.prototype.hasOwnProperty.call(normalizedOptions, 'sendSeen')
        ? normalizedOptions
        : { ...normalizedOptions, sendSeen: false };
    return originalSendMessage(chatId, content, mergedOptions);
};

// --- 5. EVENT HANDLERS ---

client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log('SCAN QR CODE DI ATAS 👆');
});

client.on('ready', async () => {
    console.log('✅ BOT ONLINE & PINTAR!');
    startCron(client);
    OtakAI.init(); 

    // Jalankan audit seluruh grup otomatis (keluar dari grup yang tidak ada Admin resmi)
    setTimeout(async () => {
        await auditAllGroups(client);
    }, 5000);
});

// --- EVENT TERIMA PESAN (DENGAN SAFE-GUARD ANTI ERROR r: r) ---
client.on('message', async (msg) => {
    // 1. Abaikan jika pesan kosong atau berasal dari Status/Broadcast WhatsApp
    if (!msg || !msg.from || msg.from === 'status@broadcast') return;

    try {
        // Safe Fetch: Cegah Puppeteer crash jika getChat() / getContact() gagal
        const chat = await msg.getChat().catch(() => null);
        const contact = await msg.getContact().catch(() => null);
        
        // Buat nilai default jika data contact/chat tidak bisa diisi
        const senderUser = contact?.id?.user || msg.from.split('@')[0];
        const location = chat 
            ? (chat.isGroup ? 'GRUP: ' + chat.name : 'JAPRI')
            : (msg.from.endsWith('@g.us') ? 'GRUP' : 'JAPRI');

        // Cetak log info pesan masuk ke terminal
        console.log(`\n============== PESAN BARU ==============`);
        console.log(`👤 Dari: ${senderUser}`); 
        console.log(`💬 Isi: ${msg.body}`);
        console.log(`📍 Lokasi: ${location}`);
        console.log(`======================================`);

        // 2. Cek sesi interaksi dengan dosen terlebih dahulu
        const isDosenSession = await handleDosenResponse(msg, client).catch(() => false);
        
        // Jika benar nomor dosen yang sedang ditanya, stop di sini agar tidak lanjut ke command bot biasa
        if (isDosenSession) return; 

        // 3. Teruskan ke handler utama bot
        await handleMessage(msg, client);

    } catch (err) {
        console.error('⚠️ Warning on message event:', err?.message || err);
    }
});

// --- HELPER KELUAR GRUP DENGAN AMAN & FALLBACK STORE ---
async function leaveGroupSafe(client, chatId) {
    if (!chatId) return;
    try {
        const chat = await client.getChatById(chatId).catch(() => null);
        if (chat && typeof chat.leave === 'function') {
            await chat.leave();
            console.log(`👋 Sukses keluar dari grup (${chatId}) via chat.leave()`);
            return;
        }
    } catch (e) {
        // Fallback jika model chat belum sync
    }

    try {
        await client.pupPage.evaluate(async (gId) => {
            const chatWid = window.Store.WidFactory.createWid(gId);
            const chat = window.Store.Chat.get(chatWid) || await window.Store.Chat.find(chatWid);
            if (chat && window.Store.GroupUtils) {
                if (window.Store.GroupUtils.sendExitGroup) {
                    await window.Store.GroupUtils.sendExitGroup(chat);
                } else if (window.Store.GroupUtils.exitGroup) {
                    await window.Store.GroupUtils.exitGroup(chatWid);
                }
            }
        }, chatId);
        console.log(`👋 Sukses keluar dari grup (${chatId}) via window.Store`);
    } catch (errPup) {
        console.error('❌ Gagal keluar grup:', errPup.message || errPup);
    }
}

// --- EVENT GROUP JOIN (HANYA ADMIN YANG BOLEH MEMASUKKAN BOT) ---
client.on('group_join', async (notification) => {
    try {
        console.log('\n>>> 🕵️‍♂️ [GROUP JOIN] Event Diterima! <<<');
        console.log('📦 Data Event:', {
            chatId: notification.chatId,
            author: notification.author,
            recipientIds: notification.recipientIds
        });

        const botIds = [
            (client.info?.wid?.user || "").split(':')[0],
            (client.info?.wid?._serialized || "").split(':')[0],
            (client.info?.lid?.user || "").split(':')[0],
            (client.info?.me?.user || "").split(':')[0],
            "209616550019256"
        ].filter(Boolean);

        const recipients = notification.recipientIds || [];
        
        // Cek apakah bot sendiri yang dimasukkan
        let isBotAdded = false;
        for (const rId of recipients) {
            const cleanR = rId.split('@')[0].split(':')[0];
            if (botIds.some(b => b === cleanR || cleanR.includes(b) || b.includes(cleanR))) {
                isBotAdded = true;
                break;
            }
            const contact = await client.getContactById(rId).catch(() => null);
            if (contact && contact.isMe) {
                isBotAdded = true;
                break;
            }
        }

        if (!isBotAdded) {
            console.log(`👥 Anggota biasa yang join grup (Bukan Bot): ${recipients.join(', ')}`);
            return;
        }

        console.log('📍 SAYA (BOT) BARU SAJA DIMASUKKAN KE DALAM GRUP!');

        await new Promise(r => setTimeout(r, 1000));

        let chat = null;
        try {
            chat = await notification.getChat();
        } catch (e) {
            chat = await client.getChatById(notification.chatId).catch(() => null);
        }

        let authorRaw = notification.author || "";
        let authorNumber = "";

        if (authorRaw) {
            const authorContact = await client.getContactById(authorRaw).catch(() => null);
            authorNumber = authorContact?.number || authorRaw.split('@')[0].split(':')[0].replace(/\D/g, '');
        }

        console.log(`👤 Pengundang Asli: ${authorNumber || '(Tidak Terdeteksi / Link Invite)'}`);

        if (!authorNumber) {
            console.log('❌ Bot masuk via link invite (Bukan manual oleh Admin). Keluar...');
            if (chat) {
                await chat.sendMessage('⚠️ *AKSES DITOLAK*\n\nMaaf, bot ini hanya boleh dimasukkan secara manual oleh *Admin Resmi* (tidak via link).').catch(() => {});
            }
            await new Promise(r => setTimeout(r, 2500));
            await leaveGroupSafe(client, notification.chatId);
            return;
        }

        // Cek apakah pengundang adalah admin di database PostgreSQL
        const isAdmin = await isAdminUser(authorNumber);

        if (isAdmin) {
            console.log(`✅ AMAN: Dimasukkan oleh Admin Valid (+${authorNumber}).`);
            if (chat) {
                await chat.sendMessage('👋 *Halo Semuanya!*\n\nSaya adalah asisten AI & Reminder Akademik. Bot ini berhasil diaktifkan oleh Admin.\n\nKetik *menu* untuk melihat fitur yang tersedia.').catch(() => {});
            }
        } else {
            console.log(`❌ DITOLAK: Dimasukkan oleh Non-Admin (+${authorNumber}). Keluar dari grup...`);
            if (chat) {
                await chat.sendMessage(`⛔ *AKSES DITOLAK*\n\nMaaf, nomor (+${authorNumber}) bukan Admin resmi yang terdaftar di database.\nBot akan keluar secara otomatis dalam 2 detik.`).catch(() => {});
            }
            await new Promise(r => setTimeout(r, 2500));
            await leaveGroupSafe(client, notification.chatId);
        }
    } catch (err) {
        console.error('❌ ERROR GROUP_JOIN:', err.message || err);
    }
});

// --- 6. JALANKAN BOT ---
client.initialize();