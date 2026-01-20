x   // index.js
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const handleMessage = require('./lib/handler');
const { startCron } = require('./lib/cron');

// Inisialisasi Client
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { headless: true, args: ['--no-sandbox'] }
});

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