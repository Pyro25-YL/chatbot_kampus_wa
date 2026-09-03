const pool = require('./lib/db');

const classesData = [
    { nama_kelas: '2025a', angkatan: '2025' },
    { nama_kelas: '2025b', angkatan: '2025' },
    { nama_kelas: '2025c', angkatan: '2025' },
    { nama_kelas: '2026a', angkatan: '2026' },
    { nama_kelas: '2026b', angkatan: '2026' },
    { nama_kelas: '2026c', angkatan: '2026' },
    { nama_kelas: 'ai137', angkatan: '2026' },
    { nama_kelas: 'bg093', angkatan: '2026' },
    { nama_kelas: 'bi060', angkatan: '2026' },
    { nama_kelas: 'hn001', angkatan: '2026' },
    { nama_kelas: 'pc023', angkatan: '2026' },
    { nama_kelas: 'pr007', angkatan: '2026' },
];

const schedulesData = [
    // === KELAS 2025A ===
    { kelas: '2025a', hari: 'Senin', jam_mulai: '13:00:00', jam_selesai: '15:30:00', matkul: 'Sistem Operasi', ruang: 'E2.01.05', dosen: 'HARMON PRAYOGI' },
    { kelas: '2025a', hari: 'Selasa', jam_mulai: '09:30:00', jam_selesai: '12:00:00', matkul: 'Desain dan Analisis Algoritma', ruang: 'E2.01.05', dosen: 'ELLY MATUL IMAH' },
    { kelas: '2025a', hari: 'Selasa', jam_mulai: '13:00:00', jam_selesai: '15:30:00', matkul: 'Pemrograman Berorientasi Objek', ruang: 'E2.01.05', dosen: 'RISKYANA DEWI INTAN PUSPITASARI' },
    { kelas: '2025a', hari: 'Rabu', jam_mulai: '13:00:00', jam_selesai: '14:40:00', matkul: 'Pemrograman Berorientasi Objek', ruang: 'C01.04.03', dosen: 'RISKYANA DEWI INTAN PUSPITASARI' },
    { kelas: '2025a', hari: 'Rabu', jam_mulai: '09:30:00', jam_selesai: '12:00:00', matkul: 'Basis Data', ruang: 'E2.01.05', dosen: 'FADHILAH QALBI ANNISA' },
    { kelas: '2025a', hari: 'Jumat', jam_mulai: '13:00:00', jam_selesai: '14:40:00', matkul: 'Basis Data', ruang: 'E2.01.05', dosen: 'FADHILAH QALBI ANNISA' },
    { kelas: '2025a', hari: 'Kamis', jam_mulai: '07:00:00', jam_selesai: '09:30:00', matkul: 'Analisis Data Multivariat', ruang: 'E2.01.05', dosen: 'IKE FITRIYANINGSIH' },
    { kelas: '2025a', hari: 'Kamis', jam_mulai: '13:00:00', jam_selesai: '15:30:00', matkul: 'Pembelajaran Mesin', ruang: 'E2.01.07', dosen: 'ELLY MATUL IMAH, LILIK ANIFAH' },

    // === KELAS 2025B ===
    { kelas: '2025b', hari: 'Senin', jam_mulai: '09:30:00', jam_selesai: '12:00:00', matkul: 'Pemrograman Berorientasi Objek', ruang: 'E2.01.06', dosen: 'RISKYANA DEWI INTAN PUSPITASARI' },
    { kelas: '2025b', hari: 'Jumat', jam_mulai: '13:00:00', jam_selesai: '14:40:00', matkul: 'Pemrograman Berorientasi Objek', ruang: 'C01.04.03', dosen: 'RISKYANA DEWI INTAN PUSPITASARI' },
    { kelas: '2025b', hari: 'Senin', jam_mulai: '13:00:00', jam_selesai: '15:30:00', matkul: 'Basis Data', ruang: 'E2.01.06', dosen: 'FADHILAH QALBI ANNISA' },
    { kelas: '2025b', hari: 'Jumat', jam_mulai: '07:50:00', jam_selesai: '09:30:00', matkul: 'Basis Data', ruang: 'C01.04.03', dosen: 'FADHILAH QALBI ANNISA' },
    { kelas: '2025b', hari: 'Selasa', jam_mulai: '13:00:00', jam_selesai: '15:30:00', matkul: 'Analisis Data Multivariat', ruang: 'E2.01.06', dosen: 'IKE FITRIYANINGSIH' },
    { kelas: '2025b', hari: 'Rabu', jam_mulai: '07:00:00', jam_selesai: '09:30:00', matkul: 'Sistem Operasi', ruang: 'E2.01.07', dosen: 'HARMON PRAYOGI' },
    { kelas: '2025b', hari: 'Rabu', jam_mulai: '09:30:00', jam_selesai: '12:00:00', matkul: 'Desain dan Analisis Algoritma', ruang: 'E2.01.07', dosen: 'ELLY MATUL IMAH' },
    { kelas: '2025b', hari: 'Kamis', jam_mulai: '07:00:00', jam_selesai: '09:30:00', matkul: 'Pembelajaran Mesin', ruang: 'E2.01.07', dosen: 'RISKYANA DEWI INTAN PUSPITASARI' },

    // === KELAS 2025C ===
    { kelas: '2025c', hari: 'Senin', jam_mulai: '09:30:00', jam_selesai: '12:00:00', matkul: 'Pembelajaran Mesin', ruang: 'E2.01.07', dosen: 'ELLY MATUL IMAH' },
    { kelas: '2025c', hari: 'Senin', jam_mulai: '13:00:00', jam_selesai: '15:30:00', matkul: 'Analisis Data Multivariat', ruang: 'E2.01.07', dosen: 'IKE FITRIYANINGSIH' },
    { kelas: '2025c', hari: 'Selasa', jam_mulai: '07:00:00', jam_selesai: '09:30:00', matkul: 'Sistem Operasi', ruang: 'E2.01.07', dosen: 'HARMON PRAYOGI' },
    { kelas: '2025c', hari: 'Selasa', jam_mulai: '09:30:00', jam_selesai: '12:00:00', matkul: 'Basis Data', ruang: 'E2.01.06', dosen: 'FADHILAH QALBI ANNISA' },
    { kelas: '2025c', hari: 'Jumat', jam_mulai: '09:30:00', jam_selesai: '11:10:00', matkul: 'Basis Data', ruang: 'C01.04.03', dosen: 'FADHILAH QALBI ANNISA' },
    { kelas: '2025c', hari: 'Kamis', jam_mulai: '09:30:00', jam_selesai: '12:00:00', matkul: 'Desain dan Analisis Algoritma', ruang: 'E2.01.07', dosen: 'ELLY MATUL IMAH' },
    { kelas: '2025c', hari: 'Kamis', jam_mulai: '13:00:00', jam_selesai: '15:30:00', matkul: 'Pemrograman Berorientasi Objek', ruang: 'E2.01.06', dosen: 'RISKYANA DEWI INTAN PUSPITASARI' },
    { kelas: '2025c', hari: 'Rabu', jam_mulai: '09:30:00', jam_selesai: '11:10:00', matkul: 'Pemrograman Berorientasi Objek', ruang: 'C01.04.03', dosen: 'RISKYANA DEWI INTAN PUSPITASARI' },

    // === KELAS 2026A ===
    { kelas: '2026a', hari: 'Senin', jam_mulai: '09:30:00', jam_selesai: '12:00:00', matkul: 'Aljabar Matriks', ruang: 'E2.01.05', dosen: 'IKE FITRIYANINGSIH' },
    { kelas: '2026a', hari: 'Senin', jam_mulai: '13:00:00', jam_selesai: '14:40:00', matkul: 'Aljabar Matriks', ruang: 'C01.04.05', dosen: 'IKE FITRIYANINGSIH' },
    { kelas: '2026a', hari: 'Selasa', jam_mulai: '07:00:00', jam_selesai: '09:30:00', matkul: 'Matematika Diskrit', ruang: 'E2.01.05', dosen: 'RISKYANA DEWI INTAN PUSPITASARI' },
    { kelas: '2026a', hari: 'Rabu', jam_mulai: '07:00:00', jam_selesai: '09:30:00', matkul: 'Interaksi Manusia dan Kecerdasan Artifisial', ruang: 'E2.01.05', dosen: 'FADHILAH QALBI ANNISA' },
    { kelas: '2026a', hari: 'Kamis', jam_mulai: '09:30:00', jam_selesai: '12:00:00', matkul: 'Matematika Dasar', ruang: 'E2.01.05', dosen: "MUKHTAMILATUS SA'DIYAH" },
    { kelas: '2026a', hari: 'Kamis', jam_mulai: '13:00:00', jam_selesai: '15:30:00', matkul: 'Dasar Pemrograman', ruang: 'E2.01.05', dosen: 'HARMON PRAYOGI' },
    { kelas: '2026a', hari: 'Kamis', jam_mulai: '07:00:00', jam_selesai: '08:40:00', matkul: 'Dasar Pemrograman', ruang: 'C01.04.03', dosen: 'HARMON PRAYOGI' },

    // === KELAS 2026B ===
    { kelas: '2026b', hari: 'Senin', jam_mulai: '07:00:00', jam_selesai: '09:30:00', matkul: 'Interaksi Manusia dan Kecerdasan Artifisial', ruang: 'E2.01.06', dosen: 'FADHILAH QALBI ANNISA' },
    { kelas: '2026b', hari: 'Selasa', jam_mulai: '09:30:00', jam_selesai: '12:00:00', matkul: 'Dasar Pemrograman', ruang: 'E2.01.07', dosen: 'HARMON PRAYOGI' },
    { kelas: '2026b', hari: 'Jumat', jam_mulai: '13:00:00', jam_selesai: '14:40:00', matkul: 'Dasar Pemrograman', ruang: 'C01.04.03', dosen: 'HARMON PRAYOGI' },
    { kelas: '2026b', hari: 'Rabu', jam_mulai: '07:00:00', jam_selesai: '09:30:00', matkul: 'Aljabar Matriks', ruang: 'E2.01.06', dosen: 'IKE FITRIYANINGSIH' },
    { kelas: '2026b', hari: 'Kamis', jam_mulai: '13:00:00', jam_selesai: '14:40:00', matkul: 'Aljabar Matriks', ruang: 'C01.04.05', dosen: 'IKE FITRIYANINGSIH' },
    { kelas: '2026b', hari: 'Rabu', jam_mulai: '13:00:00', jam_selesai: '15:30:00', matkul: 'Matematika Diskrit', ruang: 'E2.01.06', dosen: 'RISKYANA DEWI INTAN PUSPITASARI' },
    { kelas: '2026b', hari: 'Jumat', jam_mulai: '08:40:00', jam_selesai: '11:10:00', matkul: 'Matematika Dasar', ruang: 'E2.01.06', dosen: 'LIZA PUSPITA YANTI' },

    // === KELAS 2026C ===
    { kelas: '2026c', hari: 'Senin', jam_mulai: '09:30:00', jam_selesai: '12:00:00', matkul: 'Matematika Dasar', ruang: 'C01.04.03', dosen: 'LIZA PUSPITA YANTI' },
    { kelas: '2026c', hari: 'Selasa', jam_mulai: '07:00:00', jam_selesai: '09:30:00', matkul: 'Aljabar Matriks', ruang: 'E2.01.06', dosen: 'IKE FITRIYANINGSIH' },
    { kelas: '2026c', hari: 'Selasa', jam_mulai: '09:30:00', jam_selesai: '12:00:00', matkul: 'Aljabar Matriks', ruang: 'C01.04.03', dosen: 'IKE FITRIYANINGSIH' },
    { kelas: '2026c', hari: 'Rabu', jam_mulai: '09:30:00', jam_selesai: '12:00:00', matkul: 'Matematika Diskrit', ruang: 'E2.01.06', dosen: 'RISKYANA DEWI INTAN PUSPITASARI' },
    { kelas: '2026c', hari: 'Rabu', jam_mulai: '13:00:00', jam_selesai: '15:30:00', matkul: 'Dasar Pemrograman', ruang: 'E2.01.07', dosen: 'HARMON PRAYOGI' },
    { kelas: '2026c', hari: 'Kamis', jam_mulai: '07:50:00', jam_selesai: '09:30:00', matkul: 'Dasar Pemrograman', ruang: 'C01.04.05', dosen: 'HARMON PRAYOGI' },
    { kelas: '2026c', hari: 'Kamis', jam_mulai: '09:30:00', jam_selesai: '12:00:00', matkul: 'Interaksi Manusia dan Kecerdasan Artifisial', ruang: 'E2.01.06', dosen: 'FADHILAH QALBI ANNISA' },

    // === MKU / MKK KELAS KHUSUS ===
    { kelas: 'ai137', hari: 'Senin', jam_mulai: '16:20:00', jam_selesai: '18:00:00', matkul: 'Agama Islam', ruang: 'VIRTUAL', dosen: 'AGUNG ARI SUBAGIO' },
    { kelas: 'bg093', hari: 'Selasa', jam_mulai: '14:40:00', jam_selesai: '16:10:00', matkul: 'Bahasa Inggris', ruang: 'VIRTUAL', dosen: 'MUKHAYYAROTIN NISWATI RODLIYATUL JAUHARIYAH' },
    { kelas: 'bi060', hari: 'Rabu', jam_mulai: '14:40:00', jam_selesai: '16:10:00', matkul: 'Bahasa Indonesia', ruang: 'VIRTUAL', dosen: 'HENDRATNO' },
    { kelas: 'hn001', hari: 'Jumat', jam_mulai: '11:10:00', jam_selesai: '13:00:00', matkul: 'Agama Hindu', ruang: 'VIRTUAL', dosen: 'I NENGAH MARIASA' },
    { kelas: 'pc023', hari: 'Senin', jam_mulai: '07:00:00', jam_selesai: '08:40:00', matkul: 'Pancasila', ruang: 'VIRTUAL', dosen: 'SILVI NUR AFIFAH' },
    { kelas: 'pr007', hari: 'Jumat', jam_mulai: '11:10:00', jam_selesai: '13:00:00', matkul: 'Agama Protestan', ruang: 'VIRTUAL', dosen: 'MEYLIA ELIZABETH R' },
];

async function run() {
    try {
        console.log('🚀 Memulai proses sinkronisasi dan import jadwal...');

        // 1. Pastikan semua kelas ada di database
        const kelasMap = new Map();
        const resExistingKelas = await pool.query('SELECT id, nama_kelas FROM kelas');
        resExistingKelas.rows.forEach(k => {
            kelasMap.set(k.nama_kelas.toLowerCase().trim(), k.id);
        });

        for (const c of classesData) {
            const key = c.nama_kelas.toLowerCase().trim();
            if (!kelasMap.has(key)) {
                const resNew = await pool.query(
                    'INSERT INTO kelas (nama_kelas, angkatan, onboarding_done) VALUES ($1, $2, true) RETURNING id',
                    [key, c.angkatan]
                );
                kelasMap.set(key, resNew.rows[0].id);
                console.log(`➕ Kelas baru dibuat: ${key} (ID: ${resNew.rows[0].id})`);
            }
        }

        // 2. Masukkan jadwal ke tabel jadwal
        let inserted = 0;
        let updated = 0;

        for (const s of schedulesData) {
            const kelasId = kelasMap.get(s.kelas.toLowerCase().trim());
            if (!kelasId) {
                console.error(`❌ Kelas ${s.kelas} tidak ditemukan di map!`);
                continue;
            }

            // Cek apakah jadwal yang sama persis sudah ada
            const check = await pool.query(`
                SELECT id_jadwal FROM jadwal
                WHERE kelas_id = $1 AND hari = $2 AND jam_mulai = $3 AND matkul = $4
            `, [kelasId, s.hari, s.jam_mulai, s.matkul]);

            if (check.rows.length > 0) {
                // Update detail ruangan dan dosen
                await pool.query(`
                    UPDATE jadwal 
                    SET jam_selesai = $1, toleransi_keterlambatan = 15, ruangan = $2, dosen = $3
                    WHERE id_jadwal = $4
                `, [s.jam_selesai, s.ruang, s.dosen, check.rows[0].id_jadwal]);
                updated++;
            } else {
                await pool.query(`
                    INSERT INTO jadwal (hari, jam_mulai, jam_selesai, toleransi_keterlambatan, kelas_id, matkul, dosen, ruangan)
                    VALUES ($1, $2, $3, 15, $4, $5, $6, $7)
                `, [s.hari, s.jam_mulai, s.jam_selesai, kelasId, s.matkul, s.dosen, s.ruang]);
                inserted++;
            }
        }

        console.log(`✅ Selesai! Jadwal Baru Dimasukkan: ${inserted}, Jadwal Diperbarui: ${updated}`);

        const totalJadwal = await pool.query('SELECT COUNT(*) FROM jadwal');
        console.log(`📊 Total baris jadwal saat ini: ${totalJadwal.rows[0].count}`);

        process.exit(0);
    } catch (e) {
        console.error('❌ Error:', e);
        process.exit(1);
    }
}

run();
