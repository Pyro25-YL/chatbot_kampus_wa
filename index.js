const { Client, LocalAuth } = require('whatsapp-web.js');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');
const OtakAI = require('./lib/ai'); 
const handleMessage = require('./lib/handler');
const { startCron } = require('./lib/cron');
const { isAdminUser } = require('./lib/admin');

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

// --- EVENT GROUP JOIN (MENYAPA SAAT BOT MASUK GRUP) ---
client.on('group_join', async (notification) => {
    try {
        const botIds = [
            (client.info?.wid?.user || "").split(':')[0],
            (client.info?.wid?._serialized || "").split(':')[0],
            (client.info?.lid?.user || "").split(':')[0],
            (client.info?.me?.user || "").split(':')[0],
            "209616550019256"
        ].filter(Boolean);

        const recipients = notification.recipientIds || [];
        let isBotAdded = false;
        for (const rId of recipients) {
            const cleanR = rId.split('@')[0].split(':')[0];
            if (botIds.some(b => b === cleanR || cleanR.includes(b) || b.includes(cleanR))) {
                isBotAdded = true;
                break;
            }
        }

        if (isBotAdded) {
            console.log('📍 BOT BARU SAJA DIMASUKKAN KE DALAM GRUP!');
            await new Promise(r => setTimeout(r, 1500));
            const chat = await notification.getChat().catch(() => null) || await client.getChatById(notification.chatId).catch(() => null);
            if (chat) {
                await chat.sendMessage('👋 *Halo Semuanya!*\n\nSaya adalah asisten AI & Reminder Akademik S1 Kecerdasan Artifisial.\n\nKetik *menu* untuk melihat fitur atau ketik *set kelas <nama_kelas>* untuk menghubungkan grup ini.').catch(() => {});
            }
        }
    } catch (err) {
        console.error('❌ ERROR GROUP_JOIN:', err.message || err);
    }
});

// --- 6. JALANKAN BOT ---
client.initialize();