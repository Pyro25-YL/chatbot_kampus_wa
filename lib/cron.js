const cron = require('node-cron');
const pool = require('../lib/db'); // Path koneksi PostgreSQL pool Anda

// --- KONFIGURASI ---
const CRON_INTERVAL_MINUTES = 1;
const DELETE_BUFFER_MS = 60 * 1000;

const REMINDER_TIERS = [
    { label: '3 Hari Lagi', ms: 3 * 24 * 60 * 60 * 1000 },
    { label: '2 Hari Lagi', ms: 2 * 24 * 60 * 60 * 1000 },
    { label: '1 Hari Lagi', ms: 24 * 60 * 60 * 1000 },
    { label: '6 Jam Lagi', ms: 6 * 60 * 60 * 1000 },
    { label: '3 Jam Lagi', ms: 3 * 60 * 60 * 1000 },
    { label: '2 Jam Lagi', ms: 2 * 60 * 60 * 1000 },
    { label: '1 Jam Lagi', ms: 1 * 60 * 60 * 1000 },
    { label: '30 Menit Lagi', ms: 30 * 60 * 1000 }
];

const ID_MONTHS = {
    'januari': 0, 'februari': 1, 'maret': 2, 'april': 3, 'mei': 4, 'juni': 5,
    'juli': 6, 'agustus': 7, 'september': 8, 'oktober': 9, 'november': 10, 'desember': 11,
    'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'mei': 4, 'jun': 5,
    'jul': 6, 'agu': 7, 'sep': 8, 'okt': 9, 'nov': 10, 'des': 11
};

// Helper Format Tanggal YYYY-MM-DD untuk query DATE PostgreSQL
const formatYYYYMMDD = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

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
            return isNaN(result.getTime()) ? null : result;
        }
    }
    return null;
};

// Helper Hitung Waktu 2 Jam Sebelum Jam Mulai
const hitungTargetReminder2Jam = (jamMulaiStr) => {
    if (!jamMulaiStr) return null;
    const parts = jamMulaiStr.split(':');
    let h = parseInt(parts[0]);
    let m = parseInt(parts[1]);

    // Kurangi 2 jam (120 menit)
    let totalMenit = h * 60 + m - 120;
    if (totalMenit < 0) totalMenit += 24 * 60;

    const targetH = Math.floor(totalMenit / 60).toString().padStart(2, '0');
    const targetM = (totalMenit % 60).toString().padStart(2, '0');
    return `${targetH}:${targetM}`;
};

// --- LOGIC UTAMA ---
const startCron = (client) => {
    console.log(`✅ CRON JOB AKTIF: Reminder Kuliah (2 Jam Sebelum), Tugas & Jadwal Khusus`);

    cron.schedule(`*/${CRON_INTERVAL_MINUTES} * * * *`, async () => {
        try {
            const now = new Date();
            const jamSekarang = String(now.getHours()).padStart(2, '0');
            const menitSekarang = String(now.getMinutes()).padStart(2, '0');
            const waktuSekarangStr = `${jamSekarang}:${menitSekarang}`;

            const namaHariID = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];
            const hariIni = namaHariID[now.getDay()];
            const tglIniSql = formatYYYYMMDD(now);

            const esok = new Date(now);
            esok.setDate(esok.getDate() + 1);
            const hariEsok = namaHariID[esok.getDay()];
            const tglEsokSql = formatYYYYMMDD(esok);

            // ==========================================
            // BAGIAN A: REMINDER TUGAS & AUTO DELETE
            // ==========================================
            try {
                const resTugas = await pool.query(
                    `SELECT t.*, k.group_id_wa AS chat_id 
                     FROM tugas t
                     LEFT JOIN kelas k ON t.kelas_id = k.id`
                );
                for (const task of resTugas.rows) {
                    if (task.is_done) continue;
                    const dlDate = task.deadline instanceof Date ? task.deadline : (task.deadline ? new Date(task.deadline) : parseDeadline(task.deadline));
                    if (!dlDate || isNaN(dlDate.getTime())) continue;

                    const diffMs = dlDate.getTime() - now.getTime();

                    if (diffMs < -DELETE_BUFFER_MS) {
                        await pool.query(`DELETE FROM tugas WHERE id = $1`, [task.id]);
                        continue;
                    }

                    for (const tier of REMINDER_TIERS) {
                        if (diffMs <= tier.ms && diffMs > (tier.ms - 60000)) {
                            if (task.chat_id) {
                                const dlStr = dlDate.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
                                const pesan = `🚨 *REMINDER TUGAS* 🚨\n\n📌 *Tugas:* ${task.nama_tugas || task.kode_matkul || 'Tugas Kuliah'}\n⏳ *Status:* ${tier.label}\n📅 *Deadline:* ${dlStr}\n\n_Segera dikerjakan ya guys!_\n\n🏛️ *Official S1 Kecerdasan Artifisial UNESA*`;
                                await client.sendMessage(task.chat_id, pesan).catch(() => { });
                            }
                            break;
                        }
                    }
                }
            } catch (errTugas) {
                // Penanganan jika ada isu pada tabel tugas
            }

            // ==========================================
            // BAGIAN B: REMINDER JADWAL REGULER (2 JAM SEBELUM KULIAH)
            // ==========================================
            const resJadwalReguler = await pool.query(
                `SELECT 
                    j.id_jadwal,
                    j.hari,
                    j.jam_mulai,
                    j.jam_selesai,
                    j.matkul,
                    j.ruangan,
                    j.toleransi_keterlambatan,
                    COALESCE(d.nama, j.dosen) AS nama_dosen,
                    d.no_hp AS wa_dosen,
                    k.group_id_wa AS chat_id,
                    p.nama AS pj_nama,
                    p.wa AS pj_wa
                FROM jadwal j
                LEFT JOIN dosen d ON (
                    LOWER(TRIM(j.dosen)) = LOWER(TRIM(d.nama))
                    OR LOWER(TRIM(j.dosen)) LIKE LOWER(TRIM(d.nama)) || '%'
                    OR LOWER(TRIM(d.nama)) LIKE LOWER(TRIM(j.dosen)) || '%'
                )
                LEFT JOIN kelas k ON j.kelas_id = k.id
                LEFT JOIN pj p ON (p.id_jadwal = j.id_jadwal OR (p.kelas_id = j.kelas_id AND LOWER(TRIM(p.matkul)) = LOWER(TRIM(j.matkul))))
                WHERE LOWER(j.hari) IN ($1, $2)`,
                [hariIni, hariEsok]
            );

            for (const j of resJadwalReguler.rows) {
                if (!j.jam_mulai) continue;
                const targetReminderStr = hitungTargetReminder2Jam(j.jam_mulai);
                if (targetReminderStr !== waktuSekarangStr) continue;

                const jamMulaiInt = parseInt(j.jam_mulai.split(':')[0]);
                const isDiniHari = jamMulaiInt < 2; // Kuliah jam 00:00 - 02:59 pengingatnya dikirim malam H-1

                if (isDiniHari && j.hari.toLowerCase() !== hariEsok) continue;
                if (!isDiniHari && j.hari.toLowerCase() !== hariIni) continue;

                const tglCekSql = isDiniHari ? tglEsokSql : tglIniSql;

                // Cek apakah jadwal reguler dibatalkan / digantikan di tabel jadwal_khusus
                const resKhusus = await pool.query(
                    `SELECT status_perubahan FROM jadwal_khusus 
                     WHERE id_jadwal = $1 AND tanggal_asli = $2`,
                    [j.id_jadwal, tglCekSql]
                );

                if (resKhusus.rows.length > 0) {
                    console.log(`⏭️ [CRON] ${j.matkul} (${tglCekSql}) DI-SKIP karena status khusus: ${resKhusus.rows[0].status_perubahan}`);
                    continue;
                }

                const labelHari = isDiniHari ? `DINI HARI (${hariEsok.toUpperCase()})` : `HARI INI (${hariIni.toUpperCase()})`;
                const toleransiStr = (j.toleransi_keterlambatan !== null && j.toleransi_keterlambatan !== undefined) ? `${j.toleransi_keterlambatan} Menit` : '15 Menit';
                const pjGrupStr = j.pj_nama ? `\n👮‍♂️ *PJ Matkul:* ${j.pj_nama}${j.pj_wa && j.pj_wa !== '-' ? ' (wa.me/' + j.pj_wa + ')' : ''}` : '';

                // Kirim Pengingat Reguler ke Grup
                if (j.chat_id) {
                    const pesanGrup = `📢 *PENGINGAT KULIAH (2 JAM LAGI)* 📢\n\n📚 *Matkul:* ${j.matkul}\n⏰ *Jam:* ${j.jam_mulai.substring(0, 5)} - ${j.jam_selesai ? j.jam_selesai.substring(0, 5) : '-'} WIB\n🗓️ *Waktu:* ${labelHari}\n👨‍🏫 *Dosen:* ${j.nama_dosen || 'Belum Diatur'}\n📍 *Ruangan:* ${j.ruangan || '-'}\n⏱️ *Toleransi Keterlambatan:* ${toleransiStr}${pjGrupStr}\n\n_Jangan lupa dipersiapkan materi & kehadirannya ya guys!_\n\n🏛️ *Official S1 Kecerdasan Artifisial UNESA*`;
                    await client.sendMessage(j.chat_id, pesanGrup).catch(() => { });
                }

                // Japri ke Dosen
                if (j.wa_dosen) {
                    let cleanPhone = j.wa_dosen.replace(/\D/g, '');
                    if (cleanPhone.startsWith('0')) cleanPhone = '62' + cleanPhone.slice(1);

                    if (cleanPhone.length >= 9) {
                        const waDosen = `${cleanPhone}@c.us`;
                        const pesanDosen = `📢 *PENGINGAT PERKULIAHAN (2 JAM LAGI)*\n\nHalo Bapak/Ibu *${j.nama_dosen}*,\n\nMengingatkan kembali jadwal perkuliahan Anda ${labelHari}:\n\n📚 *Matkul:* ${j.matkul}\n⏰ *Jam:* ${j.jam_mulai.substring(0, 5)} WIB\n📍 *Ruangan:* ${j.ruangan || '-'}\n⏱️ *Toleransi Keterlambatan:* ${toleransiStr}${pjGrupStr}\n\n_Mohon kehadirannya ya Bapak/Ibu, terima kasih._ 🙏✨\n\n🏛️ *Official S1 Kecerdasan Artifisial UNESA*`;

                        console.log(`📤 [CRON] Mengirim pengingat japri (2 jam sebelum) ke Dosen ${j.nama_dosen} (${waDosen})...`);
                        await client.sendMessage(waDosen, pesanDosen)
                            .then(() => console.log(`✅ [CRON] Sukses kirim japri ke Dosen ${j.nama_dosen} (${waDosen})`))
                            .catch((err) => console.error(`❌ [CRON ERROR] Gagal japri ke ${waDosen}:`, err.message));
                    }
                }
            }

            // ==========================================
            // BAGIAN C: REMINDER JADWAL KHUSUS / PENGGANTI (2 JAM SEBELUM KELAS)
            // ==========================================
            const resJadwalKhusus = await pool.query(
                `SELECT 
                    jk.id_khusus,
                    jk.status_perubahan,
                    jk.jam_mulai_baru,
                    jk.jam_selesai_baru,
                    jk.tanggal_baru,
                    j.matkul,
                    j.toleransi_keterlambatan,
                    COALESCE(jk.ruangan, j.ruangan, '-') AS ruangan,
                    COALESCE(d.nama, j.dosen) AS nama_dosen,
                    d.no_hp AS wa_dosen,
                    k.group_id_wa AS chat_id,
                    p.nama AS pj_nama,
                    p.wa AS pj_wa
                FROM jadwal_khusus jk
                JOIN jadwal j ON jk.id_jadwal = j.id_jadwal
                LEFT JOIN dosen d ON (
                    LOWER(TRIM(j.dosen)) = LOWER(TRIM(d.nama))
                    OR LOWER(TRIM(j.dosen)) LIKE LOWER(TRIM(d.nama)) || '%'
                    OR LOWER(TRIM(d.nama)) LIKE LOWER(TRIM(j.dosen)) || '%'
                )
                LEFT JOIN kelas k ON j.kelas_id = k.id
                LEFT JOIN pj p ON (p.id_jadwal = j.id_jadwal OR (p.kelas_id = j.kelas_id AND LOWER(TRIM(p.matkul)) = LOWER(TRIM(j.matkul))))
                WHERE jk.tanggal_baru IN ($1, $2)`,
                [tglIniSql, tglEsokSql]
            );

            for (const jk of resJadwalKhusus.rows) {
                if (!jk.jam_mulai_baru) continue;
                const targetKhususStr = hitungTargetReminder2Jam(jk.jam_mulai_baru);
                if (targetKhususStr !== waktuSekarangStr) continue;

                const jamMulaiInt = parseInt(jk.jam_mulai_baru.split(':')[0]);
                const isDiniHari = jamMulaiInt < 2;
                const tglTargetSql = isDiniHari ? tglEsokSql : tglIniSql;

                const tglBaruStr = jk.tanggal_baru instanceof Date ? formatYYYYMMDD(jk.tanggal_baru) : String(jk.tanggal_baru);
                if (tglBaruStr !== tglTargetSql) continue;

                const toleransiStrKhusus = (jk.toleransi_keterlambatan !== null && jk.toleransi_keterlambatan !== undefined) ? `${jk.toleransi_keterlambatan} Menit` : '15 Menit';
                const pjKhususStr = jk.pj_nama ? `\n👮‍♂️ *PJ Matkul:* ${jk.pj_nama}${jk.pj_wa && jk.pj_wa !== '-' ? ' (wa.me/' + jk.pj_wa + ')' : ''}` : '';

                // Kirim Pengingat Jadwal Khusus ke Grup
                if (jk.chat_id) {
                    const pesanKhusus = `🚨 *PENGINGAT KELAS PENGGANTI (2 JAM LAGI)* 🚨\n\n📌 *Matkul:* ${jk.matkul}\n🔄 *Status:* ${jk.status_perubahan}\n⏰ *Jam Baru:* ${jk.jam_mulai_baru.substring(0, 5)} - ${jk.jam_selesai_baru ? jk.jam_selesai_baru.substring(0, 5) : '-'} WIB\n👨‍🏫 *Dosen:* ${jk.nama_dosen || 'Belum Diatur'}\n📍 *Ruangan:* ${jk.ruangan || '-'}\n⏱️ *Toleransi Keterlambatan:* ${toleransiStrKhusus}${pjKhususStr}\n\n_Mohon diperhatikan perubahan jadwal ini!_\n\n🏛️ *Official S1 Kecerdasan Artifisial UNESA*`;
                    await client.sendMessage(jk.chat_id, pesanKhusus).catch(() => { });
                }

                // Japri ke Dosen
                if (jk.wa_dosen) {
                    let cleanPhone = jk.wa_dosen.replace(/\D/g, '');
                    if (cleanPhone.startsWith('0')) cleanPhone = '62' + cleanPhone.slice(1);

                    if (cleanPhone.length >= 9) {
                        const waDosen = `${cleanPhone}@c.us`;
                        const pesanDosen = `🚨 *PENGINGAT KELAS PENGGANTI (2 JAM LAGI)*\n\nHalo Bapak/Ibu *${jk.nama_dosen}*,\n\nMengingatkan kembali jadwal kelas pengganti/khusus Anda:\n\n📚 *Matkul:* ${jk.matkul}\n⏰ *Jam Baru:* ${jk.jam_mulai_baru.substring(0, 5)} WIB\n📍 *Ruangan:* ${jk.ruangan || '-'}\n⏱️ *Toleransi Keterlambatan:* ${toleransiStrKhusus}${pjKhususStr}\n\n_Mohon kehadirannya ya Bapak/Ibu, terima kasih._ 🙏✨\n\n🏛️ *Official S1 Kecerdasan Artifisial UNESA*`;

                        console.log(`📤 [CRON] Mengirim pengingat japri jadwal khusus ke Dosen ${jk.nama_dosen} (${waDosen})...`);
                        await client.sendMessage(waDosen, pesanDosen)
                            .then(() => console.log(`✅ [CRON] Sukses kirim japri khusus ke Dosen ${jk.nama_dosen} (${waDosen})`))
                            .catch((err) => console.error(`❌ [CRON ERROR] Gagal japri khusus ke ${waDosen}:`, err.message));
                    }
                }
            }

        } catch (err) {
            console.error("❌ [CRON ERROR]", err);
        }
    }, { scheduled: true, timezone: "Asia/Jakarta" });
};

module.exports = { startCron };