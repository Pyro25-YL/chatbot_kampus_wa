const DEFAULT_RETRIES = 3;
const RETRY_DELAYS_MS = [1000, 3000, 6000];

const queue = [];
let running = false;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const enqueueSend = (task, options = {}) =>
    new Promise((resolve, reject) => {
        queue.push({ task, options, resolve, reject });
        processQueue();
    });

const processQueue = async () => {
    if (running) return;
    running = true;

    while (queue.length) {
        const { task, options, resolve, reject } = queue.shift();
        let attempts = 0;
        const maxRetries =
            typeof options.retries === 'number' ? options.retries : DEFAULT_RETRIES;

        while (true) {
            try {
                const result = await task();
                resolve(result);
                break;
            } catch (err) {
                attempts += 1;
                if (attempts > maxRetries) {
                    reject(err);
                    break;
                }
                const delay =
                    RETRY_DELAYS_MS[Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1)];
                await sleep(delay);
            }
        }
    }

    running = false;
};

// GANTI BAGIAN 'wrapSend' YANG LAMA DENGAN INI:

const wrapSend = (fn, options) => (...args) => {
    // --- 🛡️ FITUR ANTI-ALAY (Cegah Update Story) ---
    // Cek argumen pertama (biasanya ID tujuan)
    if (args.length > 0 && typeof args[0] === 'string' && args[0].includes('status@broadcast')) {
        console.log("🚫 BLOCKED: Bot mencoba update story WhatsApp. Dibatalkan.");
        return Promise.resolve(); // Pura-pura sukses tapi tidak melakukan apa-apa
    }
    // ----------------------------------------------

    // Kalau aman (bukan story), masukkan ke antrian
    return enqueueSend(() => fn(...args), options);
};

module.exports = {
    enqueueSend,
    wrapSend
};

module.exports = {
    enqueueSend,
    wrapSend
};
