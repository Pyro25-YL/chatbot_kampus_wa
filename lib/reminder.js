const moment = require('moment');

// --- 1. STATE MANAGEMENT UNTUK DOSEN ---
const DOSEN_CHAT_STATE = new Map();

const getDosenState = (dosenPhone) => DOSEN_CHAT_STATE.get(dosenPhone) || null;
const setDosenState = (dosenPhone, state) => DOSEN_CHAT_STATE.set(dosenPhone, state);
const clearDosenState = (dosenPhone) => DOSEN_CHAT_STATE.delete(dosenPhone);


// --- 2. LOGIKA REMINDER TUGAS ---

/**
 * Logika Penentu Jeda Reminder Tugas
 */
const checkReminderUrgency = (deadline) => {
    const now = moment();
    const target = moment(deadline);
    const diffInHours = target.diff(now, 'hours');

    if (diffInHours < 0) return 'expired';
    if (diffInHours <= 48) return 'hourly';
    return 'daily';
};

/**
 * Pengirim Reminder Tugas dari PostgreSQL (Dipanggil via Cron)
 */
const runTaskReminder = async (client, pool) => {
    try {
        // Query Join dengan tabel kelas untuk mendapatkan group_id_wa
        const query = `
            SELECT t.*, k.group_id_wa 
            FROM tugas t
            JOIN kelas k ON t.kelas_id = k.id
            WHERE t.status = 'active' AND t.is_done = false
        `;
        const res = await pool.query(query);
        const dbTugas = res.rows;

        dbTugas.forEach(tugas => {
            const urgency = checkReminderUrgency(tugas.deadline);
            const targetJid = tugas.group_id_wa;
            const namaTugas = tugas.nama_tugas;
            
            if (!targetJid) return;

            if (urgency === 'hourly') {
                client.sendMessage(targetJid, `🚨 *DEADLINE DEKAT!* Tugas: "${namaTugas}" kurang dari 2 hari lagi!`);
            } else if (urgency === 'daily') {
                client.sendMessage(targetJid, `📌 *Reminder Harian:* Jangan lupa kerjakan "${namaTugas}".`);
            }
        });
    } catch (err) {
        console.error('Error running task reminder:', err.message);
    }
};


// --- 3. LOGIKA REMINDER & INTERAKSI DOSEN ---

/**
 * Pemicu Pengingat Dosen Hari Ini dari Tabel Jadwal (Dipanggil Pagi Hari via Cron)
 */
const runDosenReminder = async (client, pool) => {
    try {
        const todayIndex = moment().isoWeekday(); // 1 = Senin, 7 = Minggu
        
        // Query Join dari tabel jadwal dan kelas
        const query = `
            SELECT j.*, k.group_id_wa, k.nama_kelas
            FROM jadwal j
            JOIN kelas k ON j.kelas_id = k.id
            WHERE j.hari = $1 AND j.dosen_phone IS NOT NULL AND j.dosen_phone != ''
        `;
        const res = await pool.query(query, [todayIndex]);
        const dbJadwalHariIni = res.rows;

        dbJadwalHariIni.forEach(async (jadwal) => {
            // Standarisasi Format WhatsApp JID
            let phone = (jadwal.dosen_phone || '').replace(/\D/g, '');
            if (phone.startsWith('0')) phone = '62' + phone.slice(1);
            const targetPhone = phone.endsWith('@c.us') ? phone : `${phone}@c.us`;
            
            setDosenState(targetPhone, {
                step: 'WAITING_ATTENDANCE',
                grupId: jadwal.group_id_wa,
                kelasId: jadwal.kelas_id,
                matkul: jadwal.nama_matkul || jadwal.matkul,
                kelas: jadwal.nama_kelas
            });

            const templatePesan = `Selamat pagi Bapak/Ibu Dosen Pengampu *${jadwal.nama_matkul || jadwal.matkul}* untuk kelas *${jadwal.nama_kelas}*.\n\n` +
                                  `Mohon konfirmasinya, apakah hari ini Bapak/Ibu dapat *Hadir/Masuk* mengajar?\n\n` +
                                  `✍️ _Silakan balas dengan mengetik *Masuk* atau *Tidak*._`;
            
            await client.sendMessage(targetPhone, templatePesan);
        });
    } catch (err) {
        console.error('Error running dosen reminder:', err.message);
    }
};

/**
 * Handler pesan balasan dari dosen
 */
const handleDosenResponse = async (msg, client, pool) => {
    const from = msg.from;
    const state = getDosenState(from);
    
    if (!state) return false; 

    const body = msg.body.trim().toLowerCase();

    // ─── TAHAP 1: MENUNGGU JAWABAN MASUK / TIDAK ───
    if (state.step === 'WAITING_ATTENDANCE') {
        if (body.includes('masuk') || body.includes('hadir')) {
            const pesanGrup = `📢 *PENGUMUMAN PERKULIAHAN*\n━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                              `Mata Kuliah: *${state.matkul}*\n` +
                              `Kelas: *${state.kelas}*\n` +
                              `Status Dosen: ✅ *HADIR / MASUK*\n\n` +
                              `Silakan rekan-rekan mahasiswa bersiap di ruang kelas. Terima kasih.`;
            
            await client.sendMessage(state.grupId, pesanGrup);
            await msg.reply('Baik Bapak/Ibu, terima kasih. Konfirmasi kehadiran telah saya teruskan ke grup kelas.');
            
            clearDosenState(from);
            return true;
        } 
        
        if (body.includes('tidak') || body.includes('absen') || body.includes('halangan')) {
            state.step = 'WAITING_REPLACEMENT_OPTION';
            setDosenState(from, state);

            const opsiPesan = `Baik Bapak/Ibu, terima kasih konfirmasinya.\n\n` +
                              `Mohon informasinya untuk agenda kelas pengganti:\n` +
                              `1️⃣ *Ketik langsung tanggal & jam penggantinya* jika sudah ada jadwal tetap.\n` +
                              `2️⃣ *Ketik "PJ"* jika Bapak/Ibu meminta PJ Matkul untuk berdiskusi mencari jadwal kosong.\n\n` +
                              `✍️ _Contoh: "Selasa jam 9 di ruang 402" atau ketik "PJ"_`;
            
            await msg.reply(opsiPesan);
            return true;
        }

        await msg.reply('Mohon maaf Bapak/Ibu, bisa diperjelas apakah hari ini *Masuk* atau *Tidak*?');
        return true;
    }

    // ─── TAHAP 2: MENUNGGU JADWAL PENGGANTI ATAU DELEGASI KE PJ ───
    if (state.step === 'WAITING_REPLACEMENT_OPTION') {
        if (body === 'pj' || body.includes('diskusi') || body.includes('hubungi pj')) {
            const pesanGrup = `📢 *INFORMASI PERKULIAHAN*\n━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                              `Mata Kuliah: *${state.matkul}*\n` +
                              `Kelas: *${state.kelas}*\n` +
                              `Status Kuliah: ❌ *TIDAK MASUK / KOSONG*\n\n` +
                              `💡 *Catatan:* Dosen meminta *Penanggung Jawab (PJ) Matkul* untuk segera berdiskusi dengan beliau guna menentukan jadwal kuliah pengganti.`;
            
            await client.sendMessage(state.grupId, pesanGrup);
            await msg.reply('Baik Bapak/Ibu, informasi sudah diteruskan ke grup kelas. PJ mata kuliah akan segera berdiskusi dengan Bapak/Ibu.');
            
            clearDosenState(from);
            return true;
        } else {
            const jadwalPengganti = msg.body.trim();
            
            // Simpan ke tabel jadwal_khusus
            if (pool) {
                try {
                    await pool.query(
                        'INSERT INTO jadwal_khusus (kelas_id, nama_matkul, info_pengganti) VALUES ($1, $2, $3)',
                        [state.kelasId, state.matkul, jadwalPengganti]
                    );
                } catch (err) {
                    console.error('Gagal menyimpan ke jadwal_khusus:', err.message);
                }
            }

            const pesanGrup = `📢 *PERUBAHAN JADWAL KULIAH (MAKE-UP CLASS)*\n━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                              `Mata Kuliah: *${state.matkul}*\n` +
                              `Kelas: *${state.kelas}*\n` +
                              `Status Hari Ini: ❌ *TIDAK MASUK*\n\n` +
                              `⏳ *JADWAL KULIAH PENGGANTI:*\n` +
                              `➔ *${jadwalPengganti}*\n\n` +
                              `Dimohon seluruh mahasiswa kelas untuk memperhatikan jadwal baru tersebut. Terima kasih.`;
            
            await client.sendMessage(state.grupId, pesanGrup);
            await msg.reply('Terima kasih banyak Bapak/Ibu atas informasi jadwal penggantinya. Sudah saya umumkan langsung ke grup kelas.');
            
            clearDosenState(from);
            return true;
        }
    }

    return false;
};

module.exports = { 
    checkReminderUrgency, 
    runTaskReminder, 
    runDosenReminder, 
    handleDosenResponse 
};