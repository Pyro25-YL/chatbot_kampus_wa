  // index.js
const { Client, LocalAuth } = require('whatsapp-web.js');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');
const handleMessage = require('./lib/handler');
const { startCron } = require('./lib/cron');

function resolveBravePath() {
    const candidates = [
        process.env.BRAVE_PATH,
        'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
        'C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
        process.env.LOCALAPPDATA
            ? path.join(process.env.LOCALAPPDATA, 'BraveSoftware\\Brave-Browser\\Application\\brave.exe')
            : null
    ].filter(Boolean);

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }

    return null;
}

const bravePath = resolveBravePath();
if (!bravePath) {
    console.error('Brave executable not found. Set BRAVE_PATH to your brave.exe path.');
    process.exit(1);
}

// Inisialisasi Client
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: false,
        executablePath: bravePath,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        defaultViewport: null,
        timeout: 120000,
        protocolTimeout: 300000
    }
});

// Avoid sendSeen crashes on newer WhatsApp Web builds.
const originalSendMessage = client.sendMessage.bind(client);
client.sendMessage = (chatId, content, options) => {
    const normalizedOptions = options && typeof options === 'object' ? options : {};
    const mergedOptions = Object.prototype.hasOwnProperty.call(normalizedOptions, 'sendSeen')
        ? normalizedOptions
        : { ...normalizedOptions, sendSeen: false };
    return originalSendMessage(chatId, content, mergedOptions);
};

// Event: QR Code
client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log('SCAN QR CODE DI ATAS 👆');
});

// Event: Siap
client.on('ready', () => {
    console.log('✅ BOT ONLINE & PINTAR!');
    // Jalankan cron job (reminder)
    startCron(client);
});

// Event: Terima Pesan
client.on('message', async (msg) => {
    // Oper pesan ke handler
    await handleMessage(msg, client);
});

// Jalankan Bot
client.initialize();
