const cron = require('node-cron');
const { bacaData, simpanData } = require('./database'); // Tambah simpanData
const moment = require('moment');

// Set Bahasa Indonesia & Timezone
require('moment/locale/id');
moment.locale('id');

// Fungsi Delay
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- FUNGSI PARSING TANGGAL SAKTI ---
const parseDeadline = (teksTanggal) => {
    let tgl = moment(teksTanggal, "YYYY-MM-DD HH:mm", true);
    if (!tgl.isValid()) tgl = moment(teksTanggal, "dddd, D MMMM [pukul] HH.mm", true);
    if (!tgl.isValid()) tgl = moment(teksTanggal, "dddd, D MMMM HH.mm", true);
    return tgl;
};

// --- FUNGSI CEK TUGAS ---
const cekTugasSekarang = async (client) => {
    console.log(`\n=== ⏳ CEK TUGAS: REMINDER & AUTO DELETE ===`);
    
    const now = moment(); 
    const db = bacaData();
    const groupIds = Object.keys(db);
    
    let tugasDitemukan = 0;
    let adaPerubahanDb = false; // Penanda kalau ada tugas dihapus

    for (const id of groupIds) {
        if (!db[id].tugas || !Array.isArray(db[id].tugas)) continue;

        // 1. SIAPKAN TAG ALL MEMBER
        let mentions = [];
        try {
            const chat = await client.getChatById(id);
            if (chat.isGroup) {
                mentions = chat.participants.map(m => m.id._serialized);
            }
        } catch (err) {
            // Abaikan error kalau gagal ambil member
        }

        let tasks = db[id].tugas;
        let activeTasks = []; // Array baru untuk tugas yang BELUM expired
        
        for (const t of tasks) {
            const dlMoment = parseDeadline(t.deadline);
            
            // Kalau tanggal formatnya ngawur, anggap aktif biar gak kehapus sembarangan
            if (!dlMoment.isValid()) {
                activeTasks.push(t);
                continue; 
            }

            // Hitung selisih waktu
            const diffJam = dlMoment.diff(now, 'hours', true); 

            // ====================================================
            // LOGIKA 1: AUTO DELETE (Jika Deadline Sudah Lewat)
            // ====================================================
            if (diffJam < 0) {
                console.log(`🗑️ MENGHAPUS TUGAS EXPIRED: "${t.matkul}" (Deadline: ${t.deadline})`);
                adaPerubahanDb = true;
                // Jangan push ke activeTasks, otomatis terhapus
                continue; 
            }

            // Tugas masih masa depan, masukkan ke list aktif
            activeTasks.push(t);

            // ====================================================
            // LOGIKA 2: KIRIM REMINDER (+ TAG ALL)
            // ====================================================
            let pesanReminder = "";

            // A. KONDISI URGENT (H-2 atau kurang dari 48 Jam)
            // Bot akan spamming setiap cron berjalan (tiap menit/jam)
            if (diffJam <= 48) {
                let icon = diffJam <= 12 ? "🚨🔥" : "⚠️"; 
                let teksSisa = diffJam < 1 ? "KURANG DARI 1 JAM!" : `${Math.floor(diffJam)} Jam lagi!`;

                pesanReminder = `${icon} *URGENT REMINDER* ${icon}\n` +
                                `*WOY BANGUN TUGAS MEPET!* 😡\n\n` +
                                `📚 Matkul: *${t.matkul}*\n` +
                                `⏳ Deadline: *${teksSisa}*\n` +
                                `📆 Tanggal: ${dlMoment.format('dddd, D MMMM HH:mm')}\n` +
                                `📝 Detail: ${t.detail || '-'}\n\n` +
                                `_Segera dikerjakan atau nilai E menanti!_\n` +
                                `🔊 Tag: @everyone`;
            }
            
            // B. KONDISI HARIAN (Masih Jauh > 48 Jam)
            // Hanya kirim JAM 07:00 Pagi (Waktu Server/Laptop)
            // Pakai menit < 1 biar cuma kirim sekali pas jam 7 pas
            else if (now.hour() === 7 && now.minute() === 0) {
                pesanReminder = `☀️ *REMINDER HARIAN (TAG ALL)* ☀️\n` +
                                `Selamat pagi, jangan lupa ada tugas mendatang:\n\n` +
                                `📚 Matkul: *${t.matkul}*\n` +
                                `📆 Tanggal: ${dlMoment.format('dddd, D MMMM HH:mm')}\n` +
                                `⏳ Sisa Waktu: ${Math.floor(diffJam / 24)} Hari lagi\n` +
                                `📝 Detail: ${t.detail || '-'}\n\n` +
                                `_Dicicil ya guys biar gak numpuk!_\n` +
                                `🔊 Tag: @everyone`;
            }

            // EKSEKUSI KIRIM
            if (pesanReminder) {
                try {
                    console.log(`✅ KIRIM REMINDER: ${t.matkul} ke ${db[id].nama || id}`);
                    await client.sendMessage(id, pesanReminder, { mentions: mentions });
                    tugasDitemukan++;
                    await sleep(4000); // Jeda anti-banned
                } catch (e) {
                    console.error(`❌ Gagal kirim:`, e.message);
                }
            }
        }

        // Update list tugas di database memory (hanya simpan yang belum expired)
        db[id].tugas = activeTasks;
    }
    
    // Simpan ke file JSON jika ada tugas yang dihapus
    if (adaPerubahanDb) {
        simpanData(db);
        console.log("💾 DATABASE DISIMPAN: Tugas expired berhasil dihapus.");
    }
    
    if (tugasDitemukan === 0) {
        console.log("=== 💤 TIDAK ADA REMINDER YANG DIKIRIM ===");
    } else {
        console.log("=== ✅ SELESAI KIRIM REMINDER ===");
    }
};

// --- FUNGSI START ---
const startCron = (client) => {
    console.log("⏰ Sistem Reminder Aktif (Auto Delete + Tag All)");

    // Cek pas nyala
    cekTugasSekarang(client);

    // Cek rutin tiap menit
    cron.schedule('0* * * *', async () => { 
        await cekTugasSekarang(client);
    });
};

module.exports = { startCron };