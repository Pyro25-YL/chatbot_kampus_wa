const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const OtakAI = require('./lib/ai'); 
const handleMessage = require('./lib/handler'); // <--- PANGGIL HANDLER
const { startCron } = require('./lib/cron');

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zygote', '--disable-gpu']
    }
});

client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log('SCAN QR CODE DI ATAS 👆');
});

client.on('ready', () => {
    console.log('✅ BOT ONLINE & PINTAR!');
    startCron(client);
    
    // Inisialisasi Otak AI (Load Model)
    OtakAI.init(); 
});

// Event: Terima Pesan
client.on('message', async (msg) => {
    // JANGAN PANGGIL AI LANGSUNG. PANGGIL HANDLER.
    // Handler nanti yang akan tanya ke AI.
    await handleMessage(msg, client);
});

client.initialize();