const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const cron = require('node-cron');

// --- DAFTAR ADMIN ---
const DAFTAR_ADMIN = ['6285766578692','6281343381495']; 

const FILE_DB = './database.json';

// --- DATABASE SETUP ---
if (!fs.existsSync(FILE_DB)) {
    fs.writeFileSync(FILE_DB, JSON.stringify({}));
}

const bacaData = () => JSON.parse(fs.readFileSync(FILE_DB));
const simpanData = (data) => fs.writeFileSync(FILE_DB, JSON.stringify(data, null, 2));

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { args: ['--no-sandbox'] }
});

client.on('qr', (qr) => qrcode.generate(qr, { small: true }));
client.on('ready', () => console.log('✅ Bot Siap! Cron Job Dipisah (Reminder & Cleaner).'));

// ==========================================
//    CRON JOB 1: REMINDER (SETIAP 1 jam)
// ==========================================
// Tugasnya cuma ngirim pesan, gak ngapus data.
cron.schedule('0 * * * *', async () => {
    const db = bacaData();
    const sekarang = new Date();

    for (const idGrup in db) {
        const dataGrup = db[idGrup];
        if (dataGrup.tugas && dataGrup.tugas.length > 0) {
            for (const t of dataGrup.tugas) {
                const waktuDeadline = new Date(t.deadline);
                if (isNaN(waktuDeadline.getTime())) continue;

                const selisihWaktu = waktuDeadline - sekarang; 
                const selisihJam = selisihWaktu / (1000 * 60 * 60); 

                // Reminder muncul jika sisa waktu 0 s.d 48 jam
                if (selisihJam > 0 && selisihJam <= 48) {
                    const pesanReminder = `⚠️ *REMINDER TUGAS* ⚠️\n\n` +
                        `📚 Matkul: *${t.matkul}*\n` +
                        `💬 Detail: _${t.detail}_\n` +
                        `📂 Kumpul: *${t.tempat}*\n` +
                        `📝 Format: ${t.format}\n` +
                        `⏳ Deadline: ${t.deadline}\n` +
                        `⏰ Sisa Waktu: *${selisihJam.toFixed(1)} Jam lagi!*`;
                    
                    try {
                        await client.sendMessage(idGrup, pesanReminder);
                        console.log(`✅ Reminder dikirim ke ${dataGrup.nama}: ${t.matkul}`);
                    } catch (error) {
                        console.log(`❌ Gagal kirim reminder: ${error.message}`);
                    }
                }
            }
        }
    }
});

// ==========================================
//    CRON JOB 2: PEMBERSIH (SETIAP MENIT)
// ==========================================
// Tugasnya cuma menghapus tugas expired.
// '0 * * * *' artinya menit ke-0 setiap jam (08:00, 09:00, dst)
cron.schedule('* * * * *', async () => {
    let db = bacaData();
    const sekarang = new Date();
    let adaPerubahan = false;

    console.log('🧹 Sedang mengecek tugas expired...');

    for (const idGrup in db) {
        const dataGrup = db[idGrup];
        
        if (dataGrup.tugas && dataGrup.tugas.length > 0) {
            // Filter tugas: Hanya simpan yang deadline-nya MASA DEPAN
            const tugasAktif = dataGrup.tugas.filter(t => {
                const deadline = new Date(t.deadline);
                return !isNaN(deadline.getTime()) && deadline > sekarang;
            });

            if (tugasAktif.length !== dataGrup.tugas.length) {
                console.log(`🗑️ Menghapus tugas expired di grup: ${dataGrup.nama}`);
                db[idGrup].tugas = tugasAktif;
                adaPerubahan = true;
            }
        }
    }

    if (adaPerubahan) {
        simpanData(db);
        console.log('✅ Database diperbarui setelah pembersihan.');
    }
});

client.on('message', async msg => {
    const pesan = msg.body;
    const chat = await msg.getChat();
    const idGrup = chat.id._serialized; 

    const contact = await msg.getContact();
    const nomorHP = contact.number; 
    const isAdmin = DAFTAR_ADMIN.includes(nomorHP);

    let db = bacaData();

    const initGrup = () => {
        if (!db[idGrup]) {
            db[idGrup] = { nama: chat.name, tugas: [], jadwal: [] };
        }
    };

    // --- FITUR ADMIN ---

    // 1. TAMBAH TUGAS (Auto Fix Titik ke Titik Dua)
    if (pesan.startsWith('!addtugas')) {
        if (!isAdmin) return msg.reply('⛔ Khusus Admin.');
        if (!pesan.includes('|')) return msg.reply('❌ Format: !addtugas Matkul | Detail | Tempat | Format | YYYY-MM-DD HH:mm');
        
        const isi = pesan.replace('!addtugas ', '').split('|');
        if (isi.length !== 5) return msg.reply('❌ Data Kurang! Harus 5 bagian.');

        // FIX OTOMATIS: Ganti titik (.) jadi titik dua (:) di jam
        let waktuMentah = isi[4].trim().replace('.', ':');
        const tgl = new Date(waktuMentah);
        
        if (isNaN(tgl.getTime())) return msg.reply('❌ Tanggal Error. Cek Format (Tahun-Bulan-Tanggal Jam:Menit).');

        initGrup();
        db[idGrup].tugas.push({
            matkul: isi[0].trim(), detail: isi[1].trim(), tempat: isi[2].trim(), format: isi[3].trim(), deadline: waktuMentah
        });
        simpanData(db);
        msg.reply(`✅ Tugas tersimpan!\nDeadline terbaca: ${waktuMentah}`);
    }

    // 2. EDIT TUGAS (Auto Fix Titik ke Titik Dua)
    else if (pesan.startsWith('!edittugas')) {
        if (!isAdmin) return msg.reply('⛔ Khusus Admin.');
        if (!db[idGrup] || db[idGrup].tugas.length === 0) return msg.reply('Tidak ada tugas.');

        const isi = pesan.replace('!edittugas ', '').split('|');
        const urutan = parseInt(isi[0]); 

        if (isNaN(urutan) || isi.length !== 6) { 
             return msg.reply('❌ Format: !edittugas No | Matkul | Detail | Tempat | Format | Tanggal');
        }

        if (urutan < 1 || urutan > db[idGrup].tugas.length) return msg.reply('❌ Nomor tugas salah.');

        // FIX OTOMATIS DI SINI JUGA
        let waktuMentah = isi[5].trim().replace('.', ':');
        const tgl = new Date(waktuMentah);
        
        if (isNaN(tgl.getTime())) return msg.reply('❌ Tanggal Error.');

        db[idGrup].tugas[urutan - 1] = {
            matkul: isi[1].trim(),
            detail: isi[2].trim(),
            tempat: isi[3].trim(),
            format: isi[4].trim(),
            deadline: waktuMentah
        };
        simpanData(db);
        msg.reply(`✅ Tugas nomor ${urutan} berhasil diedit!`);
    }

    // 3. HAPUS TUGAS
    else if (pesan.startsWith('!hapustugas')) {
        if (!isAdmin) return msg.reply('⛔ Khusus Admin.');
        if (!db[idGrup]) return;

        const args = pesan.split(' ');
        const urutan = parseInt(args[1]);

        if (isNaN(urutan) || urutan < 1 || urutan > db[idGrup].tugas.length) {
            return msg.reply(`❌ Nomor salah.`);
        }

        const dihapus = db[idGrup].tugas.splice(urutan - 1, 1);
        simpanData(db);
        msg.reply(`🗑️ Tugas *${dihapus[0].matkul}* dihapus.`);
    }

    // 4. ADD JADWAL
    else if (pesan.startsWith('!addjadwal')) {
        if (!isAdmin) return;
        const isi = pesan.replace('!addjadwal ', '').split('|');
        if (isi.length < 3) return msg.reply('Format: !addjadwal Hari | Matkul | Jam');
        
        initGrup();
        db[idGrup].jadwal.push({ hari: isi[0].trim(), matkul: isi[1].trim(), jam: isi[2].trim() });
        simpanData(db);
        msg.reply(`✅ Jadwal tersimpan.`);
    }

    // 5. EDIT JADWAL
    else if (pesan.startsWith('!editjadwal')) {
        if (!isAdmin) return msg.reply('⛔ Khusus Admin.');
        if (!db[idGrup] || db[idGrup].jadwal.length === 0) return msg.reply('Tidak ada jadwal.');

        const isi = pesan.replace('!editjadwal ', '').split('|');
        const urutan = parseInt(isi[0]); 

        if (isNaN(urutan) || isi.length !== 4) return msg.reply('❌ Format: !editjadwal No | Hari | Matkul | Jam');
        if (urutan < 1 || urutan > db[idGrup].jadwal.length) return msg.reply('❌ Nomor salah.');

        db[idGrup].jadwal[urutan - 1] = {
            hari: isi[1].trim(),
            matkul: isi[2].trim(),
            jam: isi[3].trim()
        };
        simpanData(db);
        msg.reply(`✅ Jadwal nomor ${urutan} berhasil diedit!`);
    }

    // 6. HAPUS JADWAL
    else if (pesan.startsWith('!hapusjadwal')) {
        if (!isAdmin) return msg.reply('⛔ Khusus Admin.');
        if (!db[idGrup]) return;

        const args = pesan.split(' ');
        const urutan = parseInt(args[1]);

        if (isNaN(urutan) || urutan < 1 || urutan > db[idGrup].jadwal.length) {
            return msg.reply(`❌ Nomor salah.`);
        }

        const dihapus = db[idGrup].jadwal.splice(urutan - 1, 1);
        simpanData(db);
        msg.reply(`🗑️ Jadwal *${dihapus[0].matkul}* dihapus.`);
    }

    // 7. RESET
    else if (pesan === '!reset') {
        if (!isAdmin) return;
        if (db[idGrup]) {
            db[idGrup].tugas = [];
            db[idGrup].jadwal = [];
            simpanData(db);
            msg.reply('🗑️ Grup bersih.');
        }
    }

    // --- MENU USER ---

    else if (pesan === '!menu') {
        let menu = `🤖 *MENU BOT*\nUser: !jadwal, !tugas\n`;
        if (isAdmin) {
            menu += `\n👑 *ADMIN MENU*:\n!addtugas | !edittugas | !hapustugas\n!addjadwal | !editjadwal | !hapusjadwal\n!reset`;
        }
        msg.reply(menu);
    }

    else if (pesan === '!tugas') {
        if (!db[idGrup] || db[idGrup].tugas.length === 0) return msg.reply('Tidak ada tugas.');
        let teks = `📝 *DAFTAR TUGAS*\n`;
        db[idGrup].tugas.forEach((t, i) => {
            teks += `\n*${i+1}. ${t.matkul}*\n   Detail: ${t.detail}\n   Deadline: ${t.deadline}`;
        });
        msg.reply(teks);
    }

    else if (pesan === '!jadwal') {
        if (!db[idGrup] || db[idGrup].jadwal.length === 0) return msg.reply('Belum ada jadwal.');
        let teks = `📅 *JADWAL*\n`;
        db[idGrup].jadwal.forEach((j, i) => teks += `${i+1}. ${j.hari} - ${j.matkul} (${j.jam})\n`);
        msg.reply(teks);
    }
});

client.initialize();