const cron = require('node-cron');
const { bacaData } = require('./database');

// Fungsi Delay (Jeda) biar bot tidak kena banned karena spamming
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const startCron = (client) => {
    console.log("⏰ Sistem Reminder Aktif (Cek setiap jam)");
    
    // Jadwal: Jalan di menit ke-0 setiap jam (01:00, 02:00, dst)
    cron.schedule('0 * * * *', async () => { 
        const now = new Date();
        const jamSekarang = now.getHours(); // Mengambil jam saat ini (0 - 23)
        
        console.log(`\n=== ⏳ CEK TUGAS JAM ${jamSekarang}:00 ===`);
        
        const db = bacaData();
        const groupIds = Object.keys(db);

        // Loop per grup
        for (const id of groupIds) {
            if (!db[id].tugas || !id.includes('@')) continue;

            let tasks = db[id].tugas;
            
            for (const t of tasks) {
                const dl = new Date(t.deadline);
                
                // Skip jika tanggal tidak valid
                if (isNaN(dl.getTime())) continue;

                // Hitung selisih waktu dalam Jam
                const diffJam = (dl - now) / (1000 * 60 * 60);

                let pesanReminder = "";

                // ==================================================
                // LOGIKA BARU
                // ==================================================

                // KONDISI 1: URGENT (H-2 atau kurang dari 48 jam)
                // Bot akan spamming SETIAP JAM
                if (diffJam > 0 && diffJam <= 48) {
                    // Tentukan level icon biar dramatis
                    let icon = diffJam <= 12 ? "🚨🔥" : "⚠️"; 
                    let teksSisa = diffJam < 1 ? "KURANG DARI 1 JAM!" : `${Math.floor(diffJam)} Jam lagi!`;

                    pesanReminder = `${icon} *REMINDER URGENT* ${icon}\n\n` +
                                    `Hayo belum ngerjain ya??\n` +
                                    `📚 Matkul: *${t.matkul}*\n` +
                                    `⏳ Deadline: *${teksSisa}*\n` +
                                    `📝 Detail: ${t.detail}\n\n` +
                                    `_Ayo kerjain sekarang, bot bakal ingetin tiap jam loh!_ 👻`;
                }
                
                // KONDISI 2: HARIAN (Masih lama, > 48 jam)
                // Bot hanya mengingatkan sekali sehari, misal jam 07:00 Pagi
                else if (diffJam > 48 && jamSekarang === 7) {
                    pesanReminder = `☀️ *Good Morning! Reminder Harian*\n\n` +
                                    `Jangan lupa ada tugas mendatang:\n` +
                                    `📚 Matkul: *${t.matkul}*\n` +
                                    `📅 Deadline: ${t.deadline}\n` +
                                    `📝 Detail: ${t.detail}\n\n` +
                                    `Dicicil ya biar nggak numpuk! 😉`;
                }

                // ==================================================

                // Eksekusi Kirim Pesan
                if (pesanReminder) {
                    try {
                        console.log(`✅ Mengirim reminder ke: ${db[id].nama} -> ${t.matkul}`);
                        await client.sendMessage(id, pesanReminder);
                        
                        // Jeda 4 detik antar pesan (PENTING karena ini mode spamming)
                        await sleep(4000); 
                    } catch (e) {
                        console.error(`❌ Gagal kirim ke ${id}:`, e.message);
                    }
                }
            }
        }
        console.log("=== ✅ SELESAI ===\n");
    });
};

module.exports = { startCron };