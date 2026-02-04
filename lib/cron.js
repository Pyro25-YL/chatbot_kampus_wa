const cron = require('node-cron');
const { bacaData, simpanData } = require('./database');

// --- KONFIGURASI ---
const CRON_INTERVAL_MINUTES = 1; // Wajib 1 menit agar presisi
const DELETE_BUFFER_MS = 60 * 1000; // Hapus tugas 1 menit setelah lewat

// --- ATURAN REMINDER (Sesuai Permintaan) ---
// ms = milidetik
const REMINDER_TIERS = [
    { label: '3 Hari Lagi', ms: 3 * 24 * 60 * 60 * 1000 },
    { label: '2 Hari Lagi', ms: 2 * 24 * 60 * 60 * 1000 },
    { label: '1 Hari Lagi', ms: 24 * 60 * 60 * 1000 },
    { label: '6 Jam Lagi',  ms: 6 * 60 * 60 * 1000 },
    { label: '3 Jam Lagi',  ms: 3 * 60 * 60 * 1000 },
    { label: '2 Jam Lagi',  ms: 2 * 60 * 60 * 1000 },
    { label: '1 Jam Lagi',  ms: 1 * 60 * 60 * 1000 },
    { label: '30 Menit Lagi', ms: 30 * 60 * 1000 }
];

// Helper: Mapping Bulan Indo
const ID_MONTHS = {
    'januari': 0, 'februari': 1, 'maret': 2, 'april': 3, 'mei': 4, 'juni': 5,
    'juli': 6, 'agustus': 7, 'september': 8, 'oktober': 9, 'november': 10, 'desember': 11,
    'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'mei': 4, 'jun': 5,
    'jul': 6, 'agu': 7, 'sep': 8, 'okt': 9, 'nov': 10, 'des': 11
};

// --- FUNGSI PARSING TANGGAL ---
const parseDeadline = (text) => {
    if (!text) return null;
    
    let cleanText = text.toString().toLowerCase()
        .replace(/(pukul|jam|tgl|tanggal|hari)/g, '') 
        .replace(/(\d+)\.(\d+)/, '$1:$2') 
        .replace(/\s+/g, ' ')
        .trim();

    const now = new Date();

    if (cleanText.includes('besok')) {
        now.setDate(now.getDate() + 1);
        cleanText = cleanText.replace('besok', `${now.getDate()} ${Object.keys(ID_MONTHS)[now.getMonth()]}`);
    } else if (cleanText.includes('lusa')) {
        now.setDate(now.getDate() + 2);
        cleanText = cleanText.replace('lusa', `${now.getDate()} ${Object.keys(ID_MONTHS)[now.getMonth()]}`);
    }

    const match = cleanText.match(/(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?(?:.*?(\d{1,2}):(\d{2}))?/);
    
    if (match) {
        const tgl = parseInt(match[1]);
        const blnStr = match[2];
        let thn = match[3] ? parseInt(match[3]) : new Date().getFullYear();
        let jam = match[4] ? parseInt(match[4]) : 23; 
        let mnt = match[5] ? parseInt(match[5]) : 59; 

        const bln = ID_MONTHS[blnStr];
        
        if (bln !== undefined) {
            let result = new Date(thn, bln, tgl, jam, mnt);
            if (!isNaN(result.getTime())) {
                if (!match[3] && result < new Date()) { 
                    // result.setFullYear(result.getFullYear() + 1); 
                }
                return result;
            }
        }
    }

    const isoDate = new Date(text);
    if (!isNaN(isoDate.getTime())) return isoDate;

    return null;
};

// --- LOGIC UTAMA ---
const startCron = (client) => {
    console.log(`✅ CRON JOB AKTIF: Pengecekan setiap ${CRON_INTERVAL_MINUTES} menit...`);

    cron.schedule(`*/${CRON_INTERVAL_MINUTES} * * * *`, async () => {
        try {
            const now = new Date();
            const db = bacaData();
            let totalChanges = 0;

            // Loop per Grup
            for (const chatId in db) {
                const group = db[chatId];
                if (!group.tugas || group.tugas.length === 0) continue;

                let keptTasks = []; 
                let groupChanged = false;

                // Loop per Tugas
                for (const task of group.tugas) {
                    
                    const dlDate = parseDeadline(task.deadline);

                    // 1. Jika tanggal gagal dibaca, simpan saja (jangan dihapus)
                    if (!dlDate || isNaN(dlDate.getTime())) {
                        keptTasks.push(task);
                        continue;
                    }

                    // Selisih waktu (Deadline - Sekarang)
                    const diffMs = dlDate.getTime() - now.getTime();

                    // 2. LOGIC AUTO DELETE (Sudah Lewat)
                    if (diffMs < -DELETE_BUFFER_MS) {
                        console.log(`🗑️ [AUTO-DELETE] Tugas "${task.matkul}" di grup "${group.nama}" dihapus (Expired).`);
                        groupChanged = true;
                        totalChanges++;
                        continue; // Hapus (tidak dimasukkan ke keptTasks)
                    }

                    // Tugas belum expired, simpan dulu
                    keptTasks.push(task);

                    // 3. LOGIC REMINDER (KIRIM PESAN)
                    // Kita cek apakah sisa waktu saat ini masuk dalam "Jendela Waktu" reminder
                    // Agar tidak spam, kita cek: Apakah diffMs <= Target DAN diffMs > Target - 1 Menit?
                    // Karena Cron jalan tiap 1 menit, logika ini memastikan pesan cuma dikirim SEKALI per target.
                    
                    const oneMinuteMs = 60 * 1000;

                    for (const tier of REMINDER_TIERS) {
                        // Cek apakah waktu sekarang pas di range tier tersebut
                        // Contoh: Reminder 30 menit (1.800.000 ms).
                        // Bot akan kirim pesan jika sisa waktu antara 29 menit s/d 30 menit.
                        if (diffMs <= tier.ms && diffMs > (tier.ms - oneMinuteMs)) {
                            
                            const pesan = `🚨 *REMINDER TUGAS* 🚨\n\n` +
                                          `📌 *Matkul:* ${task.matkul}\n` +
                                          `⏳ *Status:* ${tier.label}\n` +
                                          `📅 *Deadline:* ${task.deadline}\n\n` +
                                          `_Segera dikerjakan ya guys!_`;

                            // Kirim Pesan
                            try {
                                console.log(`🔔 Mengirim reminder "${tier.label}" ke grup: ${group.nama}`);
                                await client.sendMessage(chatId, pesan);
                            } catch (err) {
                                console.error(`❌ Gagal kirim pesan ke ${group.nama}:`, err.message);
                            }
                            
                            break; // Stop loop tier biar gak double (jarang terjadi sih)
                        }
                    }
                }

                // Simpan perubahan jika ada penghapusan
                if (groupChanged) {
                    db[chatId].tugas = keptTasks;
                }
            }

            if (totalChanges > 0) {
                simpanData(db);
            }

        } catch (err) {
            console.error("❌ [CRON ERROR]", err);
        }
    });
};

module.exports = { startCron };