const { Client, LocalAuth } = require('whatsapp-web.js');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');
const OtakAI = require('./lib/ai'); 
const handleMessage = require('./lib/handler');
const { startCron } = require('./lib/cron');
const { DAFTAR_ADMIN } = require('./config');

// --- 1. RESOLVER PATH BROWSER ---
function resolveBrowserPath() {
    const candidates = [
        process.env.CHROME_PATH,
        process.env.BRAVE_PATH,
        'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
        'C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        process.env.LOCALAPPDATA 
            ? path.join(process.env.LOCALAPPDATA, 'BraveSoftware\\Brave-Browser\\Application\\brave.exe') 
            : null,
        process.env.LOCALAPPDATA 
            ? path.join(process.env.LOCALAPPDATA, 'Google\\Chrome\\Application\\chrome.exe') 
            : null
    ].filter(Boolean);

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            console.log(`✅ Browser ditemukan: ${candidate}`);
            return candidate;
        }
    }
    return null;
}

const browserPath = resolveBrowserPath();
if (!browserPath) {
    console.error('❌ Error: Chrome/Brave tidak ditemukan.');
    process.exit(1);
}

// --- 2. INISIALISASI CLIENT ---
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        executablePath: browserPath,
        headless: false, 
        args: [
            '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zygote',
            '--single-process', '--disable-gpu'
        ],
        timeout: 0,
    },
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
    }
});

// --- 3. FIX CRASH WA WEB ---
const originalSendMessage = client.sendMessage.bind(client);
client.sendMessage = (chatId, content, options) => {
    const normalizedOptions = options && typeof options === 'object' ? options : {};
    const mergedOptions = Object.prototype.hasOwnProperty.call(normalizedOptions, 'sendSeen')
        ? normalizedOptions
        : { ...normalizedOptions, sendSeen: false };
    return originalSendMessage(chatId, content, mergedOptions);
};

// --- 4. EVENT HANDLERS ---

client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log('SCAN QR CODE DI ATAS 👆');
});

client.on('ready', () => {
    console.log('✅ BOT ONLINE & PINTAR!');
    startCron(client);
    OtakAI.init(); 
    

});

// --- EVENT TERIMA PESAN (DENGAN FILTER TAG/REPLY) ---
// --- EVENT TERIMA PESAN ---
client.on('message', async (msg) => {
    try {
        const chat = await msg.getChat();
        const contact = await msg.getContact();
        
        console.log(`\n============== PESAN BARU ==============`);
        console.log(`👤 Dari: ${contact.id.user}`); 
        console.log(`💬 Isi: ${msg.body}`);
        console.log(`📍 Lokasi: ${chat.isGroup ? 'GRUP: ' + chat.name : 'JAPRI'}`);
        console.log(`======================================`);

        // LANGSUNG LEMPAR KE HANDLER.JS!
        // Segala macam filter tag, reply, dan perintah diurus di dalam handler.
        await handleMessage(msg, client);

    } catch (err) {
        console.error('❌ Error on message event:', err);
    }
});

// --- EVENT GROUP JOIN ---
client.on('group_join', async (notification) => {
    console.log('\n>>> 🕵️‍♂️ EVENT GROUP JOIN TERDETEKSI <<<');
    try {
        for (const participantId of notification.recipientIds) {
            const contact = await client.getContactById(participantId);
            if (contact.isMe) {
                console.log(`📍 SAYA (BOT) MASUK GRUP!`);
                const chat = await notification.getChat();
                let authorId = notification.author;

                if (!authorId) {
                    console.log('❌ Masuk via Link. Keluar...');
                    await chat.sendMessage('⚠️ Maaf, saya hanya boleh di-invite Admin secara manual.');
                    setTimeout(async () => await chat.leave(), 3000);
                    return; 
                }

                const authorContact = await client.getContactById(authorId);
                const authorClean = authorContact.number; 
                const isAdmin = DAFTAR_ADMIN.some(admin => authorClean === admin || authorClean.includes(admin));

                if (isAdmin) {
                    console.log('✅ AMAN (Admin Valid).');
                    await chat.sendMessage('Halo! Bot siap membantu. (Added by Admin)');
                } else {
                    console.log('❌ USIR (Bukan Admin).');
                    await chat.sendMessage(`⚠️ AKSES DITOLAK. Anda (+${authorClean}) bukan Admin.`);
                    setTimeout(async () => await chat.leave(), 3000);
                }
                break; 
            }
        }
    } catch (err) {
        console.error('❌ ERROR GROUP_JOIN:', err);
    }
});




// --- 5. JALANKAN BOT ---
client.initialize();