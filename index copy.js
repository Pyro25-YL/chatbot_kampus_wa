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
            '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zygote', '--disable-gpu'
        ],
        timeout: 0,
    },

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
    
    // Audit Grup setelah 5 detik
    setTimeout(() => {
        auditGrupIlegal();
    }, 5000);
});


// --- EVENT TERIMA PESAN (DENGAN LOG DEBUG LENGKAP) ---
client.on('message', async (msg) => {
    try {
        const chat = await msg.getChat();
        const contact = await msg.getContact();

        // 1. CEK LOG MASUK (WAJIB NYALA)
        console.log(`\n============== PESAN BARU ==============`);
        console.log(`👤 Dari: ${contact.pushname || contact.number} (${msg.from})`);
        console.log(`💬 Isi: ${msg.body}`);
        console.log(`📍 Di Grup: ${chat.isGroup ? chat.name : 'PC Pribadi'}`);

        // ==========================================
        // 🔒 FILTER TAG / REPLY (VERSI KUAT)
        // ==========================================
        if (chat.isGroup) {
            // Pastikan data bot sudah siap
            if (!client.info || !client.info.wid) {
                console.log('⚠️ Bot belum siap 100% (Info belum load). Mengabaikan...');
                return;
            }

            const myId = client.info.wid._serialized; // ID lengkap bot (pasti unik)
            const myNumber = client.info.wid.user;    // Nomor HP bot saja
            
            // A. Cek Mention (Pakai mentionedIds - Lebih Akurat)
            // msg.mentionedIds adalah array ID string ['628xxx@c.us', ...]
            const isTagged = msg.mentionedIds.some(id => 
                id === myId || id.startsWith(myNumber) || id.includes(myNumber)
            );

            // B. Cek Reply
            let isReplyToBot = false;
            if (msg.hasQuotedMsg) {
                const quotedMsg = await msg.getQuotedMessage();
                // Cek apakah pesan yang direply adalah milik bot?
                if (quotedMsg.fromMe) {
                    isReplyToBot = true;
                }
            }

            // C. Cek Command (!menu atau p)
            const bodyLower = msg.body.toLowerCase();
            const isForceCommand = bodyLower.startsWith('!menu') || bodyLower === 'p';

            // LOGIKA KEPUTUSAN
            console.log(`🔍 Cek Trigger: Tag=${isTagged} | Reply=${isReplyToBot} | Command=${isForceCommand}`);

            // D. FINAL CHECK
            if (!isTagged && !isReplyToBot && !isForceCommand) {
                console.log("❌ Diabaikan: Tidak dipanggil di grup.");
                return; 
            }
        }
        // ==========================================

        console.log(`✅ LOLOS FILTER! Memproses ke AI...`);
        await handleMessage(msg, client);

    } catch (err) {
        console.error('❌ Error fatal di message event:', err);
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

// --- FUNGSI AUDIT GRUP ---
const auditGrupIlegal = async () => {
    console.log('🧹 [AUDIT] Memulai pemeriksaan grup...');
    try {
        const chats = await client.getChats();
        const groups = chats.filter(chat => chat.isGroup);
        console.log(`📊 Total Grup: ${groups.length}`);

        for (const group of groups) {
            const participants = group.participants.map(p => p.id.user); 
            const adaAdmin = DAFTAR_ADMIN.some(adminNo => participants.includes(adminNo));

            if (!adaAdmin) {
                console.log(`❌ ILEGAL: "${group.name}". Keluar...`);
                await group.sendMessage('⚠️ Tidak ada Admin Resmi di sini. Bye!');
                await new Promise(r => setTimeout(r, 2000));
                await group.leave();
            } else {
                console.log(`✅ AMAN: "${group.name}"`);
            }
        }
    } catch (err) {
        console.error('❌ Error audit:', err);
    }
};

// --- 5. JALANKAN BOT ---
console.log('🚀 Memulai inisialisasi Client...'); // <--- TAMBAH INI
client.initialize().then(() => {
    console.log('⚡ Client initialized!');
}).catch(err => {
    console.error('❌ Gagal inisialisasi:', err);
});
