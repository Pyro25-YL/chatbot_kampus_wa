process.env.TZ = 'Asia/Jakarta';
const { replyAI, deteksiWaktu, deteksiTanggalSpesifik, formatTanggal, ambilData, toTitleCase, showTugasNatural } = require('./utils');
const { createExcelPresensi } = require('./excel_presensi');

// --- HELPER SANITASI TEKS ---
const bersihkanTeks = (str) => str ? str.replace(/[,.]+$|^[,.]+|\s+[,.]+/g, '').replace(/\s+/g, ' ').trim() : '';

// --- HELPER KOREKSI HARI ---
const koreksiHari = (dateObj, text) => {
    if (!dateObj || !text) return dateObj;

    const days = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];
    const lower = text.toLowerCase();

    let targetDay = -1;
    days.forEach((day, index) => {
        if (lower.includes(day)) targetDay = index;
    });

    if (targetDay !== -1) {
        const currentDay = dateObj.getDay();
        const diff = targetDay - currentDay;
        dateObj.setDate(dateObj.getDate() + diff);
    }

    return dateObj;
};

// --- HELPER FORMAT WAKTU JADWAL ---
function ekstrakWaktuJadwal(pesan) {
    const timeRangeRegex = /(?:jam|pukul)?\s*(\d{1,2}[.:]\d{2})\s*(?:-|s\/d|sampai|hingga)\s*(\d{1,2}[.:]\d{2})/i;
    const matchRange = pesan.match(timeRangeRegex);

    if (matchRange) {
        return {
            jamMulai: formatTimeSql(matchRange[1]),
            jamSelesai: formatTimeSql(matchRange[2])
        };
    }

    const jamMulai = ambilData(pesan, /\b(?:jam|pukul|mulai)\s+(\d{1,2}[.:]\d{2})/i);
    const jamSelesai = ambilData(pesan, /\b(?:selesai|berakhir|sampai)\s+(\d{1,2}[.:]\d{2})/i);

    return {
        jamMulai: formatTimeSql(jamMulai),
        jamSelesai: formatTimeSql(jamSelesai)
    };
}

// --- HELPER KEMIRIPAN STRING SEDERHANA (DICE COEFFICIENT) ---
function similarityScore(s1, s2) {
    if (!s1 || !s2) return 0;
    const n1 = s1.toLowerCase().replace(/[^a-z0-9]/g, '');
    const n2 = s2.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (n1 === n2) return 1.0;
    if (n1.includes(n2) || n2.includes(n1)) return 0.8;

    const getBigrams = (str) => {
        const s = new Set();
        for (let i = 0; i < str.length - 1; i++) {
            s.add(str.substring(i, i + 2));
        }
        return s;
    };

    const b1 = getBigrams(n1);
    const b2 = getBigrams(n2);
    let intersection = 0;
    for (const bg of b1) {
        if (b2.has(bg)) intersection++;
    }

    return (2.0 * intersection) / (b1.size + b2.size || 1);
}

// --- HELPER CARI JADWAL PALING COCOK ---
function cariJadwalPalingCocok(daftarJadwal, queryMatkul) {
    if (!daftarJadwal || daftarJadwal.length === 0) return null;
    if (!queryMatkul) return daftarJadwal[0];

    const target = queryMatkul.toLowerCase().trim();

    // 1. Exact match / Contains
    let match = daftarJadwal.find(j => {
        if (!j.matkul) return false;
        const mk = j.matkul.toLowerCase().trim();
        return mk === target || mk.includes(target) || target.includes(mk);
    });
    if (match) return match;

    // 2. Acronym / Singkatan (Contoh: "IMKA" -> "Interaksi Manusia dan Komputer")
    match = daftarJadwal.find(j => {
        if (!j.matkul) return false;
        const acronym = j.matkul.split(/\s+/).map(w => w[0]).join('').toLowerCase();
        return acronym === target || target === acronym;
    });
    if (match) return match;

    // 3. Fuzzy match (toleran typo)
    let bestMatch = null;
    let highestScore = 0;

    for (const j of daftarJadwal) {
        if (!j.matkul) continue;
        const score = similarityScore(target, j.matkul);
        if (score > highestScore && score >= 0.35) {
            highestScore = score;
            bestMatch = j;
        }
    }

    return bestMatch || daftarJadwal[0];
}

// --- HELPER EKSTRAK TANGGAL JADWAL KHUSUS (ASLI & BARU) ---
function ekstrakTanggalJadwalKhusus(pesan) {
    let tglAsliSql = null;
    let tglBaruSql = null;

    // 1. Tanggal Asli / Awal / Lama / Menggantikan
    const regexAsli = /(?:tanggal\s+awal|tgl\s+awal|tanggal\s+asli|tgl\s+asli|tanggal\s+lama|tgl\s+lama|jadwal\s+awal|jadwal\s+asli|jadwal\s+lama|mengganti(?:kan)?(?:\s+jadwal)?(?:\s+tanggal|\s+tgl)?|dari\s+tanggal|dari\s+tgl)\s+([0-9a-zA-Z\s\/\'\-]+?)(?=\s+(?:tanggal\s+baru|tgl\s+baru|menjadi|ke\s+tanggal|ke\s+tgl|ganti\s+ke|pindah\s+ke|jam|pukul|mulai|selesai|dosen|status|keterangan|ruang|ruangan)|,|$)/i;
    
    const matchAsli = pesan.match(regexAsli);
    if (matchAsli) {
        const dAsli = deteksiTanggalSpesifik(matchAsli[1].trim());
        if (dAsli) {
            tglAsliSql = `${dAsli.getFullYear()}-${String(dAsli.getMonth() + 1).padStart(2, '0')}-${String(dAsli.getDate()).padStart(2, '0')}`;
        }
    }

    // 2. Tanggal Baru / Pengganti
    const regexBaru = /(?:tanggal\s+baru|tgl\s+baru|jadwal\s+baru|menjadi(?:\s+tanggal|\s+tgl)?|ke(?:\s+tanggal|\s+tgl)?|ganti\s+ke(?:\s+tanggal|\s+tgl)?|pindah\s+ke(?:\s+tanggal|\s+tgl)?)\s+([0-9a-zA-Z\s\/\'\-]+?)(?=\s+(?:tanggal\s+awal|tgl\s+awal|tanggal\s+asli|tgl\s+asli|tanggal\s+lama|tgl\s+lama|mengganti|jam|pukul|mulai|selesai|dosen|status|keterangan|ruang|ruangan)|,|$)/i;

    const matchBaru = pesan.match(regexBaru);
    if (matchBaru) {
        const dBaru = deteksiTanggalSpesifik(matchBaru[1].trim());
        if (dBaru) {
            tglBaruSql = `${dBaru.getFullYear()}-${String(dBaru.getMonth() + 1).padStart(2, '0')}-${String(dBaru.getDate()).padStart(2, '0')}`;
        }
    }

    // 3. Fallback jika tglBaru belum terdeteksi dari kata kunci khusus:
    if (!tglBaruSql) {
        let sisa = pesan;
        if (matchAsli) {
            sisa = sisa.replace(matchAsli[0], ' ');
        }
        const dSisa = deteksiTanggalSpesifik(sisa);
        if (dSisa) {
            tglBaruSql = `${dSisa.getFullYear()}-${String(dSisa.getMonth() + 1).padStart(2, '0')}-${String(dSisa.getDate()).padStart(2, '0')}`;
        }
    }

    return { 
        tglAsliSql, 
        tglBaruSql, 
        hasExplicitAsli: !!matchAsli && !!tglAsliSql, 
        hasExplicitBaru: !!matchBaru && !!tglBaruSql 
    };
}

// --- HELPER EKSTRAK MATKUL & DOSEN ---
function ekstrakMatkulDanDosen(teks) {
    let dosen = ambilData(teks, /\bdosen\s+([a-zA-Z0-9.\s,']+?)(?=\s+\b(?:matkul|hari|jam|mulai|selesai|ruangan|ruang|toleransi|tanggal|tgl|status|keterangan)\b|$)/i) || '';
    let matkul = ambilData(teks, /\bmatkul\s+([a-zA-Z0-9.\s,']+?)(?=\s+\b(?:dosen|hari|jam|mulai|selesai|ruangan|ruang|toleransi|tanggal|tgl|status|keterangan)\b|$)/i) || '';

    if (!matkul) {
        let raw = teks.replace(/^(tambah|edit|ubah|ganti|input)?\s*jadwal\s*(sementara|tambahan)?\s*\d*/i, '').trim();
        raw = raw.replace(/\bmengganti(?:kan)?\b.*/i, '').trim();
        raw = raw.replace(/\b(besok|lusa|senin|selasa|rabu|kamis|jumat|sabtu|minggu|tgl|tanggal|jam|pukul|hari)\b.*/i, '').trim();
        if (dosen) raw = raw.replace(new RegExp(`dosen\\s+${dosen.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'), '');
        matkul = raw.replace(/^(matkul|kegiatan|acara)\s+/i, '').trim();
    }

    return {
        matkul: matkul ? toTitleCase(bersihkanTeks(matkul)) : null,
        dosen: dosen ? bersihkanTeks(dosen) : null
    };
}

// --- HELPER FORMAT WAKTU & JADWAL ---
const formatTimeSql = (timeStr) => {
    if (!timeStr) return null;
    const match = timeStr.match(/(\d{1,2})[.:](\d{2})(?:[.:](\d{2}))?/);
    if (!match) return null;
    const hh = match[1].padStart(2, '0');
    const mm = match[2];
    const ss = match[3] || '00';
    return `${hh}:${mm}:${ss}`;
};

const formatTimeDisplay = (timeStr) => {
    if (!timeStr) return '';
    const match = timeStr.toString().match(/(\d{1,2})[.:](\d{2})/);
    if (!match) return timeStr;
    return `${match[1].padStart(2, '0')}:${match[2]}`;
};

function ekstrakWaktuJadwal(teks) {
    let jamMulai = null;
    let jamSelesai = null;

    // 1. Pola: "jam mulai 12.00 jam selesai 14.00" / "mulai 12.00 selesai 14.00"
    const matchMulai = teks.match(/(?:jam\s*mulai|mulai\s*jam|mulai)\s*[:=]?\s*(\d{1,2}[.:]\d{2})/i);
    const matchSelesai = teks.match(/(?:jam\s*selesai|selesai\s*jam|selesai)\s*[:=]?\s*(\d{1,2}[.:]\d{2})/i);

    if (matchMulai) {
        jamMulai = formatTimeSql(matchMulai[1]);
    }
    if (matchSelesai) {
        jamSelesai = formatTimeSql(matchSelesai[1]);
    }

    // 2. Pola range: "12.00 - 14.00", "12.00 s/d 14.00", "12.00 sampai 14.00"
    if (!jamMulai) {
        const matchRange = teks.match(/(\d{1,2}[.:]\d{2})\s*(?:-|s\/d|sampai|hingga)\s*(\d{1,2}[.:]\d{2})/i);
        if (matchRange) {
            jamMulai = formatTimeSql(matchRange[1]);
            jamSelesai = formatTimeSql(matchRange[2]);
        }
    }

    // 3. Pola tunggal: "jam 12.00", "pukul 12.00"
    if (!jamMulai) {
        const matchSingle = teks.match(/(?:jam|pukul)\s*[:=]?\s*(\d{1,2}[.:]\d{2})/i);
        if (matchSingle) {
            jamMulai = formatTimeSql(matchSingle[1]);
        }
    }

    return { jamMulai, jamSelesai };
}

function ekstrakHariJadwal(teks) {
    const days = ['senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu', 'minggu'];
    const matchHari = teks.match(/\bhari\s+([a-zA-Z']+)/i);
    if (matchHari) {
        const h = matchHari[1].toLowerCase().replace("'", '');
        if (days.includes(h)) return toTitleCase(h);
    }
    for (const d of days) {
        if (new RegExp(`\\b${d}\\b`, 'i').test(teks)) {
            return toTitleCase(d);
        }
    }
    return null;
}

const handleAkademikLogic = async (intent, context) => {
    const { msg, textClean, isAdmin, pool, idGrup, result, pesan, groupSettings, senderNumber, client } = context;

    // PENCEGAT INTENT MANUAL
    if (/^(edit|ubah|ganti)\s*jadwal\s*(sementara|tambahan)/i.test(textClean)) {
        intent = 'jadwal_sementara.edit';
    } else if (/^(hapus|del|remove)\s*jadwal\s*(sementara|tambahan)/i.test(textClean)) {
        intent = 'jadwal_sementara.hapus';
    }

    switch (intent) {
        // =======================
        // 📚 BAGIAN TUGAS
        // =======================
        case 'tugas.tambah': {
            if (!isAdmin) return msg.reply(replyAI('bukan_admin'));

            // 1. Ekstrak Waktu / Deadline secara cerdas
            const waktuAI = deteksiWaktu(pesan);
            if (!waktuAI) {
                return msg.reply("⚠️ Format tanggal/deadline tidak terbaca.\nContoh: *tambah tugas matkul Basis Data, paper, kumpul di LMS, deadline 8 September jam 17.00*");
            }

            const toleransi = new Date();
            toleransi.setHours(toleransi.getHours() - 1);
            if (waktuAI < toleransi) return msg.reply(replyAI('gagal_waktu', { tanggal: formatTanggal(waktuAI) }));

            // 2. Ekstrak Komponen Tugas (Matkul, Deskripsi/Detail, Pengumpulan)
            let rawTugas = pesan.replace(/^[.!/#]\s*/, '').replace(/^(?:tambah|catat|add)\s+tugas\s*/i, '').trim();

            let matkul = "";
            let detail = "";
            let format = "";

            if (rawTugas.includes(',')) {
                // Pola berbasis koma: [Matkul], [Detail/Deskripsi], [Tempat Kumpul], [Deadline]
                const parts = rawTugas.split(',').map(p => p.trim()).filter(Boolean);
                matkul = parts[0] || "";

                for (let i = 1; i < parts.length; i++) {
                    const p = parts[i];
                    // Cek jika part ini adalah deadline (ada kata deadline/tgl/jam), skip dari detail/format
                    if (/\b(?:deadline|dl|tgl|tanggal|jam|pukul|besok|lusa|\d{1,2}\s+(?:jan|feb|mar|apr|mei|jun|jul|agu|sep|okt|nov|des|januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember))\b/i.test(p)) {
                        continue;
                    }
                    // Cek jika part ini adalah tempat pengumpulan / format
                    if (/\b(?:kumpul|upload|lms|classroom|email|wa|gdrive|drive|link|hardcopy|kertas|format|tempat|media)\b/i.test(p)) {
                        format = p.replace(/^(?:kumpul\s+di|kumpul\s+ke|kumpul|tempat|media|format)\s*:?\s*/i, '').trim();
                    } else if (!detail) {
                        detail = p.replace(/^(?:detail(?:nya)?|deskripsi|tugas|isi)\s*:?\s*/i, '').trim();
                    } else if (!format) {
                        format = p;
                    }
                }
            } else {
                // Pola berbasis regex kata kunci
                matkul = ambilData(pesan, /(?:matkul|tugas)\s+([^,]+?)(?=\s+(?:detail|format|kumpul|tempat|deadline|dl|tgl|jam)|$)/i) ||
                         ambilData(pesan, /(?:tambah|catat)\s+tugas\s+([^,]+?)(?=\s+(?:detail|format|kumpul|tempat|deadline|dl|tgl|jam)|$)/i) ||
                         rawTugas.split(/\b(?:deadline|dl|besok|lusa|tgl|jam)\b/i)[0].trim();

                detail = ambilData(pesan, /\bdetail(?:nya)?\s+([^,]+?)(?=\s+(?:format|kumpul|tempat|deadline|dl)|$)/i) || "";
                format = ambilData(pesan, /\b(?:format|kumpul\s+di|kumpul|tempat)\s+([^,]+?)(?=\s+(?:deadline|dl|detail)|$)/i) || "";
            }

            // Bersihkan awalan kata "matkul", "mata kuliah", "tugas"
            matkul = matkul.replace(/^(?:matkul|mata kuliah|nama tugas|tugas)\s*:?\s*/i, '').trim();
            if (!matkul) matkul = "Tugas Kuliah";
            if (!detail) detail = "Via Chat";
            if (!format) format = "LMS / Sesuai Instruksi";

            const cleanMatkul = toTitleCase(bersihkanTeks(matkul));
            const cleanDetail = toTitleCase(bersihkanTeks(detail));
            let cleanFormat = toTitleCase(bersihkanTeks(format))
                .replace(/\bLms\b/g, 'LMS')
                .replace(/\bPdf\b/g, 'PDF')
                .replace(/\bPpt\b/g, 'PPT')
                .replace(/\bWa\b/g, 'WA');
            const tglStr = formatTanggal(waktuAI);

            let targetKelasId = groupSettings?.id;
            if (!targetKelasId) {
                const resK = await pool.query(`SELECT id FROM kelas WHERE group_id_wa = $1 LIMIT 1`, [idGrup]);
                if (resK.rows.length > 0) targetKelasId = resK.rows[0].id;
            }

            if (!targetKelasId) {
                return msg.reply('⚠️ Grup ini belum terhubung ke kelas manapun. Jalankan *set kelas <nama_kelas>* terlebih dahulu.');
            }

            try {
                await pool.query(
                    `INSERT INTO tugas (kelas_id, nama_tugas, deskripsi, pengumpulan, deadline, is_done, status) 
                     VALUES ($1, $2, $3, $4, $5, false, 'active')`,
                    [targetKelasId, cleanMatkul, cleanDetail, cleanFormat, waktuAI]
                );
            } catch (errTugas) {
                console.error("❌ Error simpan tugas:", errTugas.message);
            }

            await msg.reply(replyAI('sukses_tugas', { matkul: cleanMatkul, deadline: tglStr }));
            return true;
        }

        case 'tugas.lihat': {
            let resRows = [];
            let targetKelasId = groupSettings?.id;
            if (!targetKelasId) {
                const resK = await pool.query(`SELECT id FROM kelas WHERE group_id_wa = $1 LIMIT 1`, [idGrup]);
                if (resK.rows.length > 0) targetKelasId = resK.rows[0].id;
            }

            if (!targetKelasId) {
                return msg.reply('⚠️ Grup ini belum terhubung ke kelas manapun. Jalankan *set kelas <nama_kelas>* terlebih dahulu.');
            }

            try {
                const res = await pool.query('SELECT * FROM tugas WHERE kelas_id = $1 AND is_done = false ORDER BY deadline ASC, id ASC', [targetKelasId]);
                resRows = res.rows;
            } catch (err) {
                console.error("❌ Error query tugas:", err.message);
                resRows = [];
            }
            showTugasNatural(msg, resRows, textClean);
            break;
        }

        case 'tugas.hapus_pilih': {
            if (!isAdmin) return msg.reply(replyAI('bukan_admin'));

            let targetKelasId = groupSettings?.id;
            if (!targetKelasId) {
                const resK = await pool.query(`SELECT id FROM kelas WHERE group_id_wa = $1 LIMIT 1`, [idGrup]);
                if (resK.rows.length > 0) targetKelasId = resK.rows[0].id;
            }

            if (!targetKelasId) {
                return msg.reply('⚠️ Grup ini belum terhubung ke kelas manapun.');
            }

            let entityNomor = result.entities && result.entities.find(e => e.entity === 'nomor_tugas');
            if (!entityNomor || !entityNomor.option) return msg.reply("⚠️ Sebutkan nomor tugas yang mau dihapus. Contoh: 'Hapus tugas 1'");

            let nomorHapus = entityNomor.option.map(n => parseInt(n));
            let tugasList = [];
            try {
                const res = await pool.query('SELECT id FROM tugas WHERE kelas_id = $1 AND is_done = false ORDER BY deadline ASC, id ASC', [targetKelasId]);
                tugasList = res.rows;
            } catch (err) {}

            if (tugasList.length === 0) return msg.reply("Zonk! Gak ada tugas yang bisa dihapus.");

            let idsToDelete = [];
            nomorHapus.forEach(num => {
                if (tugasList[num - 1]) {
                    idsToDelete.push(tugasList[num - 1].id);
                }
            });

            if (idsToDelete.length === 0) {
                msg.reply("⚠️ Nomor tugas tidak ditemukan/salah.");
            } else {
                await pool.query('DELETE FROM tugas WHERE id = ANY($1::int[])', [idsToDelete]);
                await msg.reply(`✅ Berhasil menghapus ${idsToDelete.length} tugas.`);
                return true;
            }
            break;
        }

        case 'tugas.selesai': {
            if (!isAdmin) return msg.reply(replyAI('bukan_admin'));

            let targetKelasId = groupSettings?.id;
            if (!targetKelasId) {
                const resK = await pool.query(`SELECT id FROM kelas WHERE group_id_wa = $1 LIMIT 1`, [idGrup]);
                if (resK.rows.length > 0) targetKelasId = resK.rows[0].id;
            }

            if (!targetKelasId) {
                return msg.reply('⚠️ Grup ini belum terhubung ke kelas manapun.');
            }

            const matchNum = textClean.match(/\b(\d+)\b/);
            if (!matchNum) {
                return msg.reply("⚠️ Sebutkan nomor tugas yang sudah selesai.\nContoh: *Tugas 1 selesai* atau *selesai tugas 1*");
            }

            const numSelesai = parseInt(matchNum[1], 10);
            let tugasList = [];
            try {
                const res = await pool.query('SELECT * FROM tugas WHERE kelas_id = $1 AND is_done = false ORDER BY deadline ASC, id ASC', [targetKelasId]);
                tugasList = res.rows;
            } catch (err) {}

            const task = tugasList[numSelesai - 1];
            if (!task) {
                return msg.reply(`❌ Tugas nomor ${numSelesai} tidak ditemukan atau sudah ditandai selesai.`);
            }

            await pool.query(
                `UPDATE tugas SET is_done = true, status = 'completed' WHERE id = $1`,
                [task.id]
            );

            await msg.reply(`🎉 *Mantap!* Tugas *${task.nama_tugas}* ditandai selesai (*is_done = true, status = completed*). Tugas tidak akan muncul di daftar aktif lagi.`);
            return true;
        }

        case 'tugas.edit': {
            if (!isAdmin) return msg.reply(replyAI('bukan_admin'));

            let targetKelasId = groupSettings?.id;
            if (!targetKelasId) {
                const resK = await pool.query(`SELECT id FROM kelas WHERE group_id_wa = $1 LIMIT 1`, [idGrup]);
                if (resK.rows.length > 0) targetKelasId = resK.rows[0].id;
            }

            if (!targetKelasId) {
                return msg.reply('⚠️ Grup ini belum terhubung ke kelas manapun.');
            }

            const cleanInput = textClean.replace(/^(edit|ubah|ganti)\s*tugas\s*/i, '');
            const matchIndex = cleanInput.match(/^(\d+)/);

            if (!matchIndex) return msg.reply("⚠️ Format: *Edit tugas [Nomor], [Perubahan]*\nContoh: _Edit tugas 1 detail Resume Bab 2 pengumpulan LMS_");

            const index = parseInt(matchIndex[1]) - 1;
            let tugasList = [];
            try {
                const res = await pool.query('SELECT * FROM tugas WHERE kelas_id = $1 AND is_done = false ORDER BY deadline ASC, id ASC', [targetKelasId]);
                tugasList = res.rows;
            } catch (err) {}

            const task = tugasList[index];

            if (!task) {
                return msg.reply(`❌ Tugas nomor ${matchIndex[1]} tidak ditemukan.`);
            }

            let changes = cleanInput.replace(/^(\d+)[,\s]*/, '').trim();
            if (!changes) return msg.reply("⚠️ Masukkan apa yang mau diubah.");

            let infoUpdate = [];

            // 1. Ekstrak Pengumpulan / Tempat
            const matchPengumpulan = changes.match(/\b(?:kumpul\s+di|kumpul\s+ke|kumpul|tempat|media|pengumpulan)\s*:?\s*(.+?)(?=\s+(?:detail|ket|deskripsi|format|kertas|matkul|judul|deadline|dl)\b|,|$)/i);
            let pengumpulanVal = matchPengumpulan ? matchPengumpulan[1].trim().replace(/^(?:di|ke)\s+/i, '') : null;

            // 2. Ekstrak Detail / Deskripsi
            const matchDetail = changes.match(/\b(?:detail(?:nya)?|ket|keterangan|deskripsi|isi)\s*:?\s*(.+?)(?=\s+(?:format|kertas|kumpul|tempat|pengumpulan|matkul|judul|deadline|dl)\b|,|$)/i);
            let detailVal = matchDetail ? matchDetail[1].trim() : null;

            // 3. Ekstrak Format / Kertas
            const matchFormat = changes.match(/\b(?:format|kertas)\s*:?\s*(.+?)(?=\s+(?:detail|ket|deskripsi|kumpul|tempat|pengumpulan|matkul|judul|deadline|dl)\b|,|$)/i);
            let formatVal = matchFormat ? matchFormat[1].trim() : null;

            // Cerdas: jika detailVal isinya tentang pengumpulan (LMS, kumpul di...), alihkan ke pengumpulanVal
            if (detailVal && /\b(?:kumpul|lms|classroom|email|gdrive|link)\b/i.test(detailVal)) {
                if (!pengumpulanVal) pengumpulanVal = detailVal.replace(/^(?:kumpul\s+(?:di|ke)|kumpul)\s*/i, '');
                detailVal = null;
            }

            if (pengumpulanVal) {
                task.pengumpulan = toTitleCase(bersihkanTeks(pengumpulanVal))
                    .replace(/\bLms\b/g, 'LMS')
                    .replace(/\bPdf\b/g, 'PDF')
                    .replace(/\bPpt\b/g, 'PPT')
                    .replace(/\bWa\b/g, 'WA');
                infoUpdate.push("Pengumpulan");
            }

            if (formatVal) {
                if (/\b(paper|pdf|ppt|hvs|word|makalah|laporan|resume|essay)\b/i.test(formatVal)) {
                    task.deskripsi = toTitleCase(bersihkanTeks(formatVal));
                    infoUpdate.push("Format/Deskripsi");
                } else {
                    task.pengumpulan = toTitleCase(bersihkanTeks(formatVal)).replace(/\bLms\b/g, 'LMS');
                    infoUpdate.push("Pengumpulan");
                }
            }

            if (detailVal) {
                task.deskripsi = toTitleCase(bersihkanTeks(detailVal));
                infoUpdate.push("Deskripsi");
            }

            // 4. Ekstrak Matkul / Nama Tugas
            const matchMatkul = changes.match(/\b(?:matkul|mata kuliah|judul|pelajaran|nama tugas|tugas)\s*:?\s*(.+?)(?=\s+(?:detail|ket|deskripsi|format|kertas|kumpul|tempat|pengumpulan|deadline|dl)\b|,|$)/i);
            if (matchMatkul) {
                task.nama_tugas = toTitleCase(bersihkanTeks(matchMatkul[1]));
                infoUpdate.push("Nama Tugas");
            }

            // 5. Ekstrak Deadline
            const matchDeadline = changes.match(/\b(?:deadline|dl)\s*:?\s*(.+?)(?=\s+(?:detail|ket|deskripsi|format|kertas|kumpul|tempat|pengumpulan|matkul|judul)\b|,|$)/i);
            if (matchDeadline) {
                let w = deteksiWaktu(matchDeadline[1]);
                if (w) {
                    task.deadline = w;
                    infoUpdate.push("Deadline");
                }
            }

            if (infoUpdate.length === 0) {
                let w = deteksiWaktu(changes);
                const isTimeText = /(besok|lusa|minggu|senin|selasa|rabu|kamis|jumat|sabtu|tgl|tanggal|jam|pukul)/i.test(changes);

                if (w && isTimeText) {
                    task.deadline = w;
                    infoUpdate.push("Deadline");
                } else {
                    task.deskripsi = toTitleCase(bersihkanTeks(changes));
                    infoUpdate.push("Deskripsi");
                }
            }

            await pool.query(
                `UPDATE tugas SET nama_tugas = $1, deskripsi = $2, pengumpulan = $3, deadline = $4 WHERE id = $5`,
                [task.nama_tugas, task.deskripsi, task.pengumpulan, task.deadline, task.id]
            );

            const dlTampil = task.deadline instanceof Date ? task.deadline.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : task.deadline;
            await msg.reply(`✅ *Sukses Edit Tugas ${matchIndex[1]}* (${infoUpdate.join(', ')})\n\n📚 *Tugas:* ${task.nama_tugas}\n📝 *Deskripsi:* ${task.deskripsi || '-'}\n📂 *Pengumpulan:* ${task.pengumpulan || '-'}\n⏳ *Deadline:* ${dlTampil}`);
            return true;
        }

        // =======================
        // 📅 BAGIAN JADWAL REGULER
        // =======================
        case 'jadwal.lihat': {
            let kelasId = groupSettings?.id;

            if (!kelasId) {
                // Resolusi kelas jika di chat pribadi (Japri) untuk Mahasiswa / Orang Tua
                const senderClean = (senderNumber || msg.from || '').replace(/\D/g, '');
                const variants = [
                    senderClean,
                    senderClean.replace(/^62/, '0'),
                    senderClean.startsWith('0') ? '62' + senderClean.slice(1) : senderClean
                ].filter(Boolean);

                const resKelasMhs = await pool.query(
                    `SELECT kelas_id FROM mahasiswa WHERE no_wa = ANY($1::text[]) 
                     UNION 
                     SELECT m.kelas_id FROM ortu o JOIN mahasiswa m ON (
                         LOWER(TRIM(o.mahasiswa_id)) = LOWER(TRIM(m.nim)) 
                         OR LOWER(TRIM(o.mahasiswa_id)) = LOWER(TRIM(m.rfid_uid)) 
                         OR LOWER(TRIM(o.mahasiswa_id)) = LOWER(TRIM(m.nama))
                     ) WHERE o.no_hp = ANY($1::text[])
                     LIMIT 1`,
                    [variants]
                );
                if (resKelasMhs.rows.length > 0) {
                    kelasId = resKelasMhs.rows[0].kelas_id;
                }
            }

            if (!kelasId) {
                return msg.reply('⚠️ Grup/Akun ini belum terhubung ke kelas manapun. Silakan hubungi Admin atau jalankan *set kelas <nama_kelas>* di grup.');
            }

            const resJadwal = await pool.query(
                `SELECT * FROM jadwal 
                WHERE kelas_id = $1 
                ORDER BY jam_mulai ASC`,
                [kelasId]
            );
            const listJadwal = resJadwal.rows;
            if (listJadwal.length === 0) return msg.reply("📭 *Belum ada jadwal kuliah rutin yang tersimpan.*");

            let t = "📅 *JADWAL KULIAH REGULER*\n───────────────────\n";
            let currentHari = "";

            listJadwal.forEach((x, i) => {
                const hariUpper = (x.hari || '').toUpperCase();
                if (hariUpper !== currentHari) {
                    t += `\n🗓️ *${hariUpper}*\n`;
                    currentHari = hariUpper;
                }

                const matkulClean = bersihkanTeks(toTitleCase(x.matkul || x.nama_matkul || ''));
                const dosenClean = x.dosen && x.dosen !== '-' ? bersihkanTeks(toTitleCase(x.dosen)) : 'Belum Set';

                const jamM = formatTimeDisplay(x.jam_mulai);
                const jamS = formatTimeDisplay(x.jam_selesai);
                const jamStr = jamS ? `${jamM} - ${jamS} WIB` : `${jamM} WIB`;
                const ruangStr = x.ruangan && x.ruangan !== '-' ? `\n📍 *Ruang:* ${x.ruangan}` : '';
                const toleransiVal = (x.toleransi_keterlambatan !== null && x.toleransi_keterlambatan !== undefined) ? `${x.toleransi_keterlambatan} Menit` : '15 Menit';
                const toleransiStr = `\n⏱️ *Toleransi Keterlambatan:* ${toleransiVal}`;

                t += `*[${i + 1}]*\n👨‍🏫 *Dosen:* ${dosenClean}\n📚 *Matkul:* ${matkulClean}\n🗓️ *Hari:* ${toTitleCase(x.hari)}\n⏰ *Jam:* ${jamStr}${ruangStr}${toleransiStr}\n`;
            });

            t += `\n───────────────────\nℹ️ *Info:* Ketik *"Hapus jadwal 1, 2"* untuk menghapus.`;
            msg.reply(t);
            break;
        }

        case 'jadwal.tambah': {
            if (!isAdmin) return msg.reply(replyAI('bukan_admin'));

            const kelasId = groupSettings?.id;
            if (!kelasId) return msg.reply('⚠️ Silakan jalankan *set kelas <nama_kelas>* terlebih dahulu.');

            const m_jadwal = ambilData(pesan, /\bmatkul\s+([a-zA-Z0-9.\s,']+?)(?=\s+\b(?:dosen|hari|jam|mulai|selesai|ruangan|ruang|toleransi)\b|$)/i) || 
                            ambilData(pesan, /\bjadwal\s+([a-zA-Z0-9.\s,']+?)(?=\s+\b(?:dosen|hari|jam|mulai|selesai|ruangan|ruang|toleransi)\b|$)/i);
            const d_jadwal = ambilData(pesan, /\bdosen\s+([a-zA-Z0-9.\s,']+?)(?=\s+\b(?:matkul|hari|jam|mulai|selesai|ruangan|ruang|toleransi)\b|$)/i) || "-";
            const r_jadwal = ambilData(pesan, /\b(?:ruangan|ruang|r\.)\s+([a-zA-Z0-9.\s\-_/]+?)(?=\s+\b(?:matkul|dosen|hari|jam|mulai|selesai|toleransi)\b|$)/i) || "-";
            const h_jadwal = ekstrakHariJadwal(pesan);
            const { jamMulai, jamSelesai } = ekstrakWaktuJadwal(pesan);

            const matchToleransi = pesan.match(/toleransi(?:\s+keterlambatan)?\s*[:=]?\s*(\d+)/i);
            const toleransiKeterlambatan = matchToleransi ? parseInt(matchToleransi[1]) : 15;

            if (m_jadwal && h_jadwal && jamMulai) {
                const cleanMatkul = toTitleCase(bersihkanTeks(m_jadwal));
                const cleanDosen = bersihkanTeks(d_jadwal);
                const cleanHari = toTitleCase(bersihkanTeks(h_jadwal));
                const cleanRuangan = bersihkanTeks(r_jadwal);

                try {
                    await pool.query(
                        `INSERT INTO jadwal (kelas_id, hari, jam_mulai, jam_selesai, toleransi_keterlambatan, matkul, dosen, ruangan) 
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                        [kelasId, cleanHari, jamMulai, jamSelesai, toleransiKeterlambatan, cleanMatkul, cleanDosen, cleanRuangan]
                    );
                } catch (errDb) {
                    try {
                        await pool.query(
                            `INSERT INTO jadwal (kelas_id, hari, jam_mulai, jam_selesai, matkul, dosen, ruangan) 
                             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                            [kelasId, cleanHari, jamMulai, jamSelesai, cleanMatkul, cleanDosen, cleanRuangan]
                        );
                    } catch (errDb2) {
                        await pool.query(
                            `INSERT INTO jadwal (kelas_id, hari, jam_mulai, matkul, dosen) 
                             VALUES ($1, $2, $3, $4, $5)`,
                            [kelasId, cleanHari, jamMulai, cleanMatkul, cleanDosen]
                        );
                    }
                }

                const jamTampil = jamSelesai ? `${formatTimeDisplay(jamMulai)} - ${formatTimeDisplay(jamSelesai)} WIB` : `${formatTimeDisplay(jamMulai)} WIB`;
                let replyTeks = `✅ *Jadwal Disimpan!*\n\n👨‍🏫 *Dosen:* ${cleanDosen}\n📚 *Matkul:* ${cleanMatkul}\n🗓️ *Hari:* ${cleanHari}\n⏰ *Jam:* ${jamTampil}\n⏱️ *Toleransi:* ${toleransiKeterlambatan} menit`;
                if (cleanRuangan && cleanRuangan !== '-') {
                    replyTeks += `\n📍 *Ruangan:* ${cleanRuangan}`;
                }
                msg.reply(replyTeks);
            } else {
                msg.reply("⚠️ Format salah. Contoh:\n*'Tambah jadwal matkul IMKA, dosen Asep, jam mulai 12.00 jam selesai 14.00 hari Rabu toleransi keterlambatan 5 menit'*");
            }
            break;
        }

        case 'jadwal.hapus': {
            if (!isAdmin) return msg.reply(replyAI('bukan_admin'));

            const kelasId = groupSettings?.id;
            if (!kelasId) return msg.reply('⚠️ Silakan jalankan *set kelas <nama_kelas>* terlebih dahulu.');

            const numbersFound = textClean.match(/\d+/g);
            if (!numbersFound) {
                return msg.reply("⚠️ Sebutkan nomor jadwal yang mau dihapus.\nContoh: *'Hapus jadwal 1, 3'*");
            }

            const resJadwal = await pool.query('SELECT * FROM jadwal WHERE kelas_id = $1 ORDER BY jam_mulai ASC', [kelasId]);
            const listJadwal = resJadwal.rows;
            if (listJadwal.length === 0) return msg.reply("Zonk! Jadwal udah kosong.");

            const idsToDelete = numbersFound
                .map(n => parseInt(n))
                .map(idx => {
                    const row = listJadwal[idx - 1];
                    return row ? (row.id || row.id_jadwal) : null;
                })
                .filter(Boolean);

            if (idsToDelete.length > 0) {
                try {
                    await pool.query('DELETE FROM jadwal WHERE id = ANY($1::int[])', [idsToDelete]);
                } catch (e) {
                    await pool.query('DELETE FROM jadwal WHERE id_jadwal = ANY($1::int[])', [idsToDelete]);
                }
                msg.reply(`✅ Sukses menghapus *${idsToDelete.length}* jadwal.`);
            } else {
                msg.reply("⚠️ Nomor jadwal tidak ditemukan. Cek lagi list jadwalnya.");
            }
            break;
        }

        case 'jadwal.edit': {
            if (!isAdmin) return msg.reply(replyAI('bukan_admin'));

            const kelasId = groupSettings?.id;
            if (!kelasId) return msg.reply('⚠️ Silakan jalankan *set kelas <nama_kelas>* terlebih dahulu.');

            let editIdJadwal = result.entities && result.entities.find(e => e.entity === 'nomor_jadwal')?.option;
            if (!editIdJadwal) {
                const numMatch = textClean.match(/\d+/);
                if (numMatch) editIdJadwal = numMatch[0];
            }
            if (!editIdJadwal) return msg.reply("⚠️ Sebutkan nomor jadwal yang mau diedit. Contoh: *'Ubah jadwal 2 jam 10:00'*");

            let indexJadwal = parseInt(editIdJadwal) - 1;
            const resJadwal = await pool.query('SELECT * FROM jadwal WHERE kelas_id = $1 ORDER BY jam_mulai ASC', [kelasId]);
            let listJadwal = resJadwal.rows;

            if (!listJadwal[indexJadwal]) return msg.reply(`❌ Jadwal nomor ${editIdJadwal} tidak ditemukan.`);

            let jadwalLama = listJadwal[indexJadwal];
            const targetId = jadwalLama.id || jadwalLama.id_jadwal;
            let updateJadwal = false;
            let infoUpdate = [];

            const waktuBaru = ekstrakWaktuJadwal(pesan);
            if (waktuBaru.jamMulai) {
                jadwalLama.jam_mulai = waktuBaru.jamMulai;
                jadwalLama.jam_selesai = waktuBaru.jamSelesai || jadwalLama.jam_selesai;
                updateJadwal = true;
                infoUpdate.push("Jam");
            }

            const hariBaru = ekstrakHariJadwal(pesan);
            if (hariBaru) {
                jadwalLama.hari = hariBaru;
                updateJadwal = true;
                infoUpdate.push("Hari");
            }

            const mkBaru = ambilData(pesan, /\bmatkul\s+([a-zA-Z0-9.\s,']+?)(?=\s+\b(?:dosen|hari|jam|mulai|selesai|ruangan|ruang|toleransi)\b|$)/i);
            if (mkBaru) {
                jadwalLama.matkul = toTitleCase(bersihkanTeks(mkBaru));
                updateJadwal = true;
                infoUpdate.push("Matkul");
            }

            const dsBaru = ambilData(pesan, /\bdosen\s+([a-zA-Z0-9.\s,']+?)(?=\s+\b(?:matkul|hari|jam|mulai|selesai|ruangan|ruang|toleransi)\b|$)/i);
            if (dsBaru) {
                jadwalLama.dosen = bersihkanTeks(dsBaru);
                updateJadwal = true;
                infoUpdate.push("Dosen");
            }

            const rgBaru = ambilData(pesan, /\b(?:ruangan|ruang|r\.)\s+([a-zA-Z0-9.\s\-_/]+?)(?=\s+\b(?:matkul|dosen|hari|jam|mulai|selesai|toleransi)\b|$)/i);
            if (rgBaru) {
                jadwalLama.ruangan = bersihkanTeks(rgBaru);
                updateJadwal = true;
                infoUpdate.push("Ruangan");
            }

            const matchTolEdit = pesan.match(/toleransi(?:\s+keterlambatan)?\s*[:=]?\s*(\d+)/i);
            if (matchTolEdit) {
                jadwalLama.toleransi_keterlambatan = parseInt(matchTolEdit[1]);
                updateJadwal = true;
                infoUpdate.push("Toleransi");
            }

            if (updateJadwal) {
                jadwalLama.matkul = bersihkanTeks(jadwalLama.matkul);
                jadwalLama.dosen = bersihkanTeks(jadwalLama.dosen);

                try {
                    await pool.query(
                        `UPDATE jadwal SET matkul = $1, dosen = $2, hari = $3, jam_mulai = $4, jam_selesai = $5, ruangan = $6, toleransi_keterlambatan = $7 WHERE id = $8`,
                        [jadwalLama.matkul, jadwalLama.dosen, jadwalLama.hari, jadwalLama.jam_mulai, jadwalLama.jam_selesai, jadwalLama.ruangan || '-', jadwalLama.toleransi_keterlambatan || 15, targetId]
                    );
                } catch (e) {
                    await pool.query(
                        `UPDATE jadwal SET matkul = $1, dosen = $2, hari = $3, jam_mulai = $4, jam_selesai = $5, ruangan = $6, toleransi_keterlambatan = $7 WHERE id_jadwal = $8`,
                        [jadwalLama.matkul, jadwalLama.dosen, jadwalLama.hari, jadwalLama.jam_mulai, jadwalLama.jam_selesai, jadwalLama.ruangan || '-', jadwalLama.toleransi_keterlambatan || 15, targetId]
                    );
                }

                const jamDisplay = jadwalLama.jam_selesai ? `${formatTimeDisplay(jadwalLama.jam_mulai)} - ${formatTimeDisplay(jadwalLama.jam_selesai)} WIB` : `${formatTimeDisplay(jadwalLama.jam_mulai)} WIB`;
                const ruangStr = jadwalLama.ruangan && jadwalLama.ruangan !== '-' ? `\n📍 *Ruang:* ${jadwalLama.ruangan}` : '';
                const tolStr = `\n⏱️ *Toleransi Keterlambatan:* ${jadwalLama.toleransi_keterlambatan || 15} Menit`;
                msg.reply(`✅ *Sukses Edit Jadwal ${editIdJadwal}* (${infoUpdate.join(', ')})\n\n👨‍🏫 *Dosen:* ${jadwalLama.dosen || '-'}\n📚 *Matkul:* ${jadwalLama.matkul}\n🗓️ *Hari:* ${jadwalLama.hari}\n⏰ *Jam:* ${jamDisplay}${ruangStr}${tolStr}`);
            } else {
                msg.reply("⚠️ Tidak ada perubahan.\nGunakan kata kunci: *hari*, *jam*, *matkul*, *dosen*, *ruangan*, atau *toleransi*.\nContoh: _'Ubah jadwal 3 jam 13:00 toleransi 10 menit'_");
            }
            break;
        }

        // =======================
        // ⏳ JADWAL SEMENTARA / TAMBAHAN
        // =======================
        // ⏳ JADWAL SEMENTARA / KHUSUS (TABEL JADWAL_KHUSUS)
        // =======================
        case 'jadwal_sementara.tambah': {
            if (!isAdmin) return msg.reply(replyAI('bukan_admin'));

            const kelasId = groupSettings?.id;
            if (!kelasId) return msg.reply('⚠️ Silakan jalankan *set kelas <nama_kelas>* terlebih dahulu.');

            // Cari matkul yang dimaksud dari database kelas
            const { matkul, dosen } = ekstrakMatkulDanDosen(textClean);
            const m_jadwal = matkul || ambilData(pesan, /\bmatkul\s+([^,]+?)(?=\s+(?:dosen|hari|jam|mulai|selesai|ruangan|ruang|tanggal|tgl)|,|$)/i);
            
            // Ambil seluruh daftar jadwal di kelas ini
            const resJadwalSemua = await pool.query(
                `SELECT id_jadwal, matkul, dosen, hari FROM jadwal WHERE kelas_id = $1`,
                [kelasId]
            );

            if (resJadwalSemua.rows.length === 0) {
                return msg.reply("⚠️ Belum ada jadwal reguler di kelas ini. Buat jadwal reguler dulu ya via *Tambah jadwal*.");
            }

            const targetJadwal = cariJadwalPalingCocok(resJadwalSemua.rows, m_jadwal);
            const idJadwal = targetJadwal.id_jadwal;
            const matkulNama = targetJadwal.matkul;
            const dosenNama = (dosen && dosen !== '-') ? dosen : targetJadwal.dosen;

            const { tglAsliSql, tglBaruSql } = ekstrakTanggalJadwalKhusus(pesan);
            const { jamMulai, jamSelesai } = ekstrakWaktuJadwal(pesan);
            const statusPerubahan = ambilData(pesan, /\b(?:status|keterangan)\s+([^,]+?)(?=,|$)/i) || 'Jadwal Pengganti';
            const r_jadwal = ambilData(pesan, /\b(?:ruangan|ruang|r\.)\s+([^,]+?)(?=\s+(?:status|tanggal|tgl|jam|mulai|selesai|dosen)|,|$)/i) || targetJadwal.ruangan || '-';

            const finalTglBaru = tglBaruSql || new Date().toISOString().split('T')[0];

            await pool.query(
                `INSERT INTO jadwal_khusus (id_jadwal, tanggal_asli, status_perubahan, tanggal_baru, jam_mulai_baru, jam_selesai_baru, ruangan) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [idJadwal, tglAsliSql, statusPerubahan, finalTglBaru, jamMulai || '08:00:00', jamSelesai || '10:00:00', bersihkanTeks(r_jadwal)]
            );

            let pesanSukses = `✅ *Jadwal Sementara / Khusus Disimpan!*\n\n` +
                `📚 *Matkul:* ${matkulNama}\n` +
                `👨‍🏫 *Dosen:* ${dosenNama || '-'}\n` +
                `📌 *Status:* ${statusPerubahan}\n` +
                `🗓️ *Tanggal Baru:* ${finalTglBaru}\n` +
                `⏰ *Jam:* ${jamMulai ? formatTimeDisplay(jamMulai) : '08:00'} - ${jamSelesai ? formatTimeDisplay(jamSelesai) : '10:00'} WIB\n`;
            if (r_jadwal && r_jadwal !== '-') {
                pesanSukses += `📍 *Ruangan:* ${bersihkanTeks(r_jadwal)}\n`;
            }
            if (tglAsliSql) {
                pesanSukses += `🔄 *Menggantikan Tanggal:* ${tglAsliSql}\n`;
            }

            msg.reply(pesanSukses);
            break;
        }

        case 'jadwal_sementara.edit': {
            if (!isAdmin) return msg.reply(replyAI('bukan_admin'));

            const kelasId = groupSettings?.id;
            if (!kelasId) return msg.reply('⚠️ Silakan jalankan *set kelas <nama_kelas>* terlebih dahulu.');

            const matchIndex = textClean.match(/(?:sementara|tambahan|khusus)\s+(\d+)/i) || textClean.match(/\d+/);
            if (!matchIndex) return msg.reply("⚠️ Format: *Edit jadwal sementara [No] [Perubahan]*");

            const index = parseInt(matchIndex[1] || matchIndex[0]) - 1;
            const resSmt = await pool.query(
                `SELECT jk.*, j.matkul, j.dosen, COALESCE(jk.ruangan, j.ruangan, '-') AS ruangan_jadwal
                 FROM jadwal_khusus jk
                 JOIN jadwal j ON jk.id_jadwal = j.id_jadwal
                 WHERE j.kelas_id = $1
                 ORDER BY jk.tanggal_baru ASC, jk.jam_mulai_baru ASC`,
                [kelasId]
            );
            const listSementara = resSmt.rows;

            if (!listSementara[index]) return msg.reply("❌ Jadwal sementara tidak ditemukan.");

            let item = listSementara[index];
            let infoUpdate = [];

            const statusB = ambilData(pesan, /\b(?:status|keterangan)\s+([^,]+?)(?=,|$)/i);
            if (statusB) {
                item.status_perubahan = statusB;
                infoUpdate.push("Status");
            }

            const { tglAsliSql, tglBaruSql, hasExplicitAsli, hasExplicitBaru } = ekstrakTanggalJadwalKhusus(pesan);

            if (hasExplicitAsli && tglAsliSql) {
                item.tanggal_asli = tglAsliSql;
                infoUpdate.push("Tanggal Asli");
            }

            if (hasExplicitBaru && tglBaruSql) {
                item.tanggal_baru = tglBaruSql;
                infoUpdate.push("Tanggal Baru");
            } else if (!hasExplicitAsli && tglBaruSql) {
                item.tanggal_baru = tglBaruSql;
                infoUpdate.push("Tanggal Baru");
            }

            const { jamMulai, jamSelesai } = ekstrakWaktuJadwal(pesan);
            if (jamMulai) {
                item.jam_mulai_baru = jamMulai;
                item.jam_selesai_baru = jamSelesai || item.jam_selesai_baru;
                infoUpdate.push("Jam");
            }

            const ruangB = ambilData(pesan, /\b(?:ruangan|ruang|r\.)\s+([^,]+?)(?=,|$)/i);
            if (ruangB) {
                item.ruangan = bersihkanTeks(ruangB);
                infoUpdate.push("Ruangan");
            }

            if (infoUpdate.length === 0) return msg.reply("⚠️ Tidak ada perubahan yang terbaca.");

            await pool.query(
                `UPDATE jadwal_khusus 
                 SET status_perubahan = $1, tanggal_asli = $2, tanggal_baru = $3, jam_mulai_baru = $4, jam_selesai_baru = $5, ruangan = $6 
                 WHERE id_khusus = $7`,
                [item.status_perubahan, item.tanggal_asli, item.tanggal_baru, item.jam_mulai_baru, item.jam_selesai_baru, item.ruangan || '-', item.id_khusus]
            );

            let replyEdit = `✅ *Sukses Edit Jadwal Sementara ${index + 1}* (${infoUpdate.join(', ')})\n\n` +
                `📚 *Matkul:* ${item.matkul}\n` +
                `📌 *Status:* ${item.status_perubahan}\n` +
                `🗓️ *Tanggal Baru:* ${item.tanggal_baru}\n` +
                `⏰ *Jam:* ${item.jam_mulai_baru ? formatTimeDisplay(item.jam_mulai_baru) : '-'} - ${item.jam_selesai_baru ? formatTimeDisplay(item.jam_selesai_baru) : '-'} WIB`;
            if (item.ruangan && item.ruangan !== '-') {
                replyEdit += `\n📍 *Ruangan:* ${item.ruangan}`;
            }
            if (item.tanggal_asli) {
                replyEdit += `\n🔄 *Menggantikan Tanggal:* ${item.tanggal_asli}`;
            }

            msg.reply(replyEdit);
            break;
        }

        case 'jadwal_sementara.lihat': {
            const kelasId = groupSettings?.id;
            if (!kelasId) return msg.reply('⚠️ Silakan jalankan *set kelas <nama_kelas>* terlebih dahulu.');

            const resSmt = await pool.query(
                `SELECT 
                    jk.id_khusus,
                    jk.id_jadwal,
                    jk.tanggal_asli,
                    jk.status_perubahan,
                    jk.tanggal_baru,
                    jk.jam_mulai_baru,
                    jk.jam_selesai_baru,
                    COALESCE(jk.ruangan, j.ruangan, '-') AS ruangan,
                    j.matkul,
                    j.dosen
                FROM jadwal_khusus jk
                JOIN jadwal j ON jk.id_jadwal = j.id_jadwal
                WHERE j.kelas_id = $1
                ORDER BY jk.tanggal_baru ASC, jk.jam_mulai_baru ASC`,
                [kelasId]
            );
            const listSementara = resSmt.rows;

            if (listSementara.length === 0) return msg.reply("🍃 *Tidak ada jadwal sementara/khusus saat ini.*");

            let t = "⏳ *JADWAL SEMENTARA / KHUSUS*\n───────────────────\n";
            listSementara.forEach((item, i) => {
                let matkulClean = bersihkanTeks(item.matkul || 'Mata Kuliah');
                let dosenClean = item.dosen ? bersihkanTeks(item.dosen) : '-';
                
                const tglBaruStr = item.tanggal_baru ? new Date(item.tanggal_baru).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '-';
                const jamMulai = item.jam_mulai_baru ? item.jam_mulai_baru.substring(0, 5) : '';
                const jamSelesai = item.jam_selesai_baru ? item.jam_selesai_baru.substring(0, 5) : '';
                const jamStr = jamSelesai ? `${jamMulai} - ${jamSelesai} WIB` : (jamMulai ? `${jamMulai} WIB` : '');
                const tglAsliStr = item.tanggal_asli ? new Date(item.tanggal_asli).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : null;
                const ruangStr = item.ruangan && item.ruangan !== '-' ? `\n📍 *Ruang:* ${item.ruangan}` : '';

                t += `*[${i + 1}]*\n` +
                    `📚 *Matkul:* ${toTitleCase(matkulClean)}\n` +
                    `👨‍🏫 *Dosen:* ${toTitleCase(dosenClean)}\n` +
                    `📌 *Status:* ${item.status_perubahan || 'Perubahan Jadwal'}\n` +
                    `🗓️ *Tanggal Baru:* ${tglBaruStr}\n` +
                    (jamStr ? `⏰ *Jam:* ${jamStr}` : '') +
                    ruangStr + '\n' +
                    (tglAsliStr ? `🔄 *Menggantikan Tanggal:* ${tglAsliStr}\n` : '') +
                    `───────────────────\n`;
            });

            t += `_ℹ️ Ketik *Hapus jadwal sementara [Nomor]* untuk menghapus._`;
            msg.reply(t);
            break;
        }

        case 'jadwal_sementara.hapus': {
            if (!isAdmin) return msg.reply(replyAI('bukan_admin'));

            const kelasId = groupSettings?.id;
            if (!kelasId) return msg.reply('⚠️ Silakan jalankan *set kelas <nama_kelas>* terlebih dahulu.');

            const nums = textClean.match(/\d+/g);
            if (!nums) return msg.reply("⚠️ Contoh: *'Hapus jadwal sementara 1'*");

            const resSmt = await pool.query(
                `SELECT jk.id_khusus 
                 FROM jadwal_khusus jk
                 JOIN jadwal j ON jk.id_jadwal = j.id_jadwal
                 WHERE j.kelas_id = $1
                 ORDER BY jk.tanggal_baru ASC, jk.jam_mulai_baru ASC`,
                [kelasId]
            );
            const listSementara = resSmt.rows;

            const idsToDelete = nums
                .map(n => parseInt(n))
                .map(idx => listSementara[idx - 1]?.id_khusus)
                .filter(Boolean);

            if (idsToDelete.length > 0) {
                await pool.query('DELETE FROM jadwal_khusus WHERE id_khusus = ANY($1::int[])', [idsToDelete]);
                msg.reply(`✅ Menghapus *${idsToDelete.length}* jadwal sementara/khusus.`);
            } else {
                msg.reply("⚠️ Nomor jadwal sementara tidak ditemukan.");
            }
            break;
        }

        // =======================
        // 👨‍🏫 MENU DOSEN (TABEL DOSEN POSTGRESQL)
        // =======================
        case 'dosen.tambah': {
            if (!isAdmin) return msg.reply(replyAI('bukan_admin'));

            let raw = textClean.replace(/^(tambah|input|buat)\s*dosen\s*/i, '').trim();
            let waRaw = '';
            const waMatch = raw.match(/(?:wa|whatsapp|nomor|no|hp)\s*[:=]?\s*([0-9+]+)/i);
            if (waMatch) {
                waRaw = waMatch[1];
                raw = raw.replace(/(?:wa|whatsapp|nomor|no|hp)\s*[:=]?\s*([0-9+]+)/i, '').trim();
            }

            let namaRaw = raw.replace(/^nama\s*[:=]?\s*/i, '').replace(/^[,\s]+/, '').trim();
            let cleanNama = toTitleCase(bersihkanTeks(namaRaw));

            if (cleanNama && cleanNama.length > 1) {
                let cleanWa = waRaw.replace(/\D/g, '');
                if (cleanWa.startsWith('0')) cleanWa = '62' + cleanWa.slice(1);

                await pool.query(
                    `INSERT INTO dosen (nama, no_hp) VALUES ($1, $2)`,
                    [cleanNama, cleanWa || '-']
                );

                msg.reply(`✅ *Data Dosen Disimpan!*\n\n👨‍🏫 *Dosen:* ${cleanNama}\n📱 *WA:* ${cleanWa ? 'https://wa.me/' + cleanWa : '-'}`);
            } else {
                msg.reply("⚠️ Format: *Tambah dosen [Nama], wa [Nomor WA]*\nContoh: _Tambah dosen Dr. Asep, wa 08123456789_");
            }
            break;
        }

        case 'dosen.lihat': {
            const resDosen = await pool.query(`
                SELECT d.id, d.nama, d.no_hp, STRING_AGG(DISTINCT j.matkul, ', ') AS daftar_matkul
                FROM dosen d
                LEFT JOIN jadwal j ON LOWER(d.nama) = LOWER(j.dosen)
                GROUP BY d.id, d.nama, d.no_hp
                ORDER BY d.nama ASC
            `);
            if (resDosen.rows.length === 0) return msg.reply("👨‍🏫 Belum ada data dosen di database.");

            let t = "👨‍🏫 *DATA DOSEN PENGAMPU*\n───────────────────\n";
            resDosen.rows.forEach((d, i) => {
                const cleanPhone = (d.no_hp || '').replace(/\D/g, '');
                const linkWa = cleanPhone ? `https://wa.me/${cleanPhone.startsWith('0') ? '62' + cleanPhone.slice(1) : cleanPhone}` : '-';
                const matkulStr = d.daftar_matkul ? `\n    📚 *Matkul:* ${toTitleCase(d.daftar_matkul)}` : '';
                t += `\n*${i + 1}. ${bersihkanTeks(toTitleCase(d.nama))}*${matkulStr}\n    📱 *WA:* ${linkWa}\n`;
            });
            t += `\n───────────────────\nℹ️ *Info:* Tambah dosen via *Tambah dosen [Nama], wa [Nomor]*`;
            msg.reply(t);
            break;
        }

        case 'dosen.hapus': {
            if (!isAdmin) return msg.reply(replyAI('bukan_admin'));
            const num = textClean.match(/\d+/);
            if (!num) return msg.reply("⚠️ Contoh: *Hapus dosen 1*");

            const idx = parseInt(num[0]) - 1;
            const resDosen = await pool.query('SELECT id, nama FROM dosen ORDER BY nama ASC');
            const target = resDosen.rows[idx];

            if (!target) return msg.reply("❌ Nomor dosen tidak ditemukan.");

            await pool.query('DELETE FROM dosen WHERE id = $1', [target.id]);
            msg.reply(`✅ Dosen *${target.nama}* berhasil dihapus.`);
            break;
        }

        case 'dosen.edit': {
            if (!isAdmin) return msg.reply(replyAI('bukan_admin'));

            const cleanInput = textClean.replace(/^(edit|ubah|ganti)\s*dosen\s*/i, '').trim();
            const matchIndex = cleanInput.match(/^(\d+)/);
            if (!matchIndex) return msg.reply("⚠️ Format: *Edit dosen [No], [Perubahan]*\nContoh: _Edit dosen 1 wa 08123456789_ atau _Edit dosen 1 nama Dr. Budi_");

            const idx = parseInt(matchIndex[1]) - 1;
            const resDosen = await pool.query('SELECT id, nama, no_hp FROM dosen ORDER BY nama ASC');
            const target = resDosen.rows[idx];

            if (!target) return msg.reply(`❌ Data dosen nomor ${matchIndex[1]} tidak ditemukan.`);

            let sisaTeks = cleanInput.replace(/^(\d+)[,\s]*/, '').trim();
            let info = [];

            // 1. Ekstrak WA jika ada
            const waMatch = sisaTeks.match(/(?:wa|whatsapp|no wa|nomor|hp)\s*[:=]?\s*([0-9+]+)/i);
            if (waMatch) {
                let waFix = waMatch[1].replace(/\D/g, '');
                if (waFix.startsWith('0')) waFix = '62' + waFix.substring(1);
                target.no_hp = waFix;
                info.push("WA");
                sisaTeks = sisaTeks.replace(/(?:wa|whatsapp|no wa|nomor|hp)\s*[:=]?\s*([0-9+]+)/i, '').trim();
            }

            // 2. Ekstrak Nama jika ada
            const namaMatch = sisaTeks.match(/(?:nama|dosen)\s*[:=]?\s*([^,]+)/i);
            if (namaMatch) {
                const namaBersih = toTitleCase(bersihkanTeks(namaMatch[1]));
                if (namaBersih && namaBersih.length > 1) {
                    target.nama = namaBersih;
                    info.push("Nama");
                }
            } else if (sisaTeks.length > 1 && !sisaTeks.match(/^(wa|hp|nomor)/i)) {
                const namaBersih = toTitleCase(bersihkanTeks(sisaTeks.replace(/^[,\s]+/, '')));
                if (namaBersih && namaBersih.length > 1) {
                    target.nama = namaBersih;
                    info.push("Nama");
                }
            }

            if (info.length === 0) return msg.reply("⚠️ Tidak ada perubahan yang terbaca.\nContoh: *Edit dosen 1 wa 08123456789* atau *Edit dosen 1 nama Dr. Budi*");

            await pool.query(
                `UPDATE dosen SET nama = $1, no_hp = $2 WHERE id = $3`,
                [target.nama, target.no_hp || '-', target.id]
            );

            msg.reply(`✅ *Sukses Edit Dosen ${matchIndex[1]}* (${info.join(', ')})\n\n👨‍🏫 *Dosen:* ${target.nama}\n📱 *WA:* ${target.no_hp && target.no_hp !== '-' ? 'https://wa.me/' + target.no_hp : '-'}`);
            break;
        }

        // =======================
        // 👮‍♂️ MENU PJ (TERHUBUNG DENGAN JADWAL KELAS)
        // =======================
        case 'pj.tambah': {
            if (!isAdmin) return msg.reply(replyAI('bukan_admin'));

            let targetKelasId = groupSettings?.id;
            if (!targetKelasId) {
                const resK = await pool.query(`SELECT id FROM kelas WHERE group_id_wa = $1 LIMIT 1`, [idGrup]);
                if (resK.rows.length > 0) targetKelasId = resK.rows[0].id;
            }

            if (!targetKelasId) {
                return msg.reply('⚠️ Grup ini belum terhubung ke kelas manapun. Jalankan *set kelas <nama_kelas>* terlebih dahulu.');
            }

            const nama = ambilData(pesan, /(?:nama|pj)\s+(.+?)(?=\s+(?:matkul|wa|nomor)|$)/i);
            const matkul = ambilData(pesan, /matkul\s+(.+?)(?=\s+(?:wa|nomor)|$)/i) || "Umum";
            const wa = ambilData(pesan, /(?:wa|nomor|no)\s+(.+?)(?=$)/i) || "-";

            if (nama) {
                let cleanWa = wa.replace(/\D/g, '');
                if (cleanWa.startsWith('0')) cleanWa = '62' + cleanWa.slice(1);

                const cNama = toTitleCase(bersihkanTeks(nama));
                const cMatkul = toTitleCase(bersihkanTeks(matkul));

                // Cari jadwal yang cocok di kelas ini untuk mendapatkan id_jadwal
                let idJadwalRelasi = null;
                let namaMatkulFinal = cMatkul;
                let infoJadwal = '';

                try {
                    const resJadwalKelas = await pool.query(
                        'SELECT id_jadwal, matkul, hari, jam_mulai, dosen FROM jadwal WHERE kelas_id = $1',
                        [targetKelasId]
                    );
                    const matchedJadwal = cariJadwalPalingCocok(resJadwalKelas.rows, cMatkul);
                    if (matchedJadwal) {
                        idJadwalRelasi = matchedJadwal.id_jadwal;
                        namaMatkulFinal = matchedJadwal.matkul;
                        infoJadwal = `\n🗓️ *Jadwal Terhubung:* ${matchedJadwal.hari} (${formatTimeDisplay(matchedJadwal.jam_mulai)} WIB)`;
                    }
                } catch (errCari) {}

                try {
                    await pool.query(
                        `INSERT INTO pj (kelas_id, id_jadwal, nama, matkul, wa) VALUES ($1, $2, $3, $4, $5)`,
                        [targetKelasId, idJadwalRelasi, cNama, namaMatkulFinal, cleanWa]
                    );
                } catch (e) {
                    await pool.query(
                        `INSERT INTO pj (kelas_id, nama, matkul, wa) VALUES ($1, $2, $3, $4)`,
                        [targetKelasId, cNama, namaMatkulFinal, cleanWa]
                    );
                }

                msg.reply(`✅ *Data PJ Disimpan & Terhubung!* 👮‍♂️\n\n👤 *PJ:* ${cNama}\n📚 *Matkul:* ${namaMatkulFinal}${infoJadwal}\n📱 *WA:* wa.me/${cleanWa}\n\n_💡 PJ ini memiliki hak akses untuk mengelola tugas & jadwal di grup ini._`);
            } else {
                msg.reply("⚠️ Format: *Tambah PJ [Nama] Matkul [Matkul] WA [Nomor]*");
            }
            break;
        }

        case 'pj.lihat': {
            let resRows = [];
            let targetKelasId = groupSettings?.id;
            if (!targetKelasId) {
                const resK = await pool.query(`SELECT id FROM kelas WHERE group_id_wa = $1 LIMIT 1`, [idGrup]);
                if (resK.rows.length > 0) targetKelasId = resK.rows[0].id;
            }

            if (!targetKelasId) {
                return msg.reply('⚠️ Grup ini belum terhubung ke kelas manapun. Jalankan *set kelas <nama_kelas>* terlebih dahulu.');
            }

            try {
                const res = await pool.query(`
                    SELECT p.*, j.hari, j.jam_mulai, j.jam_selesai, j.dosen, j.ruangan
                    FROM pj p
                    LEFT JOIN jadwal j ON p.id_jadwal = j.id_jadwal
                    WHERE p.kelas_id = $1 
                    ORDER BY p.id ASC
                `, [targetKelasId]);
                resRows = res.rows;
            } catch (err) {
                console.error("❌ Error query PJ:", err.message);
                resRows = [];
            }

            if (resRows.length === 0) return msg.reply("👮‍♂️ Belum ada data Penanggung Jawab (PJ) yang terdaftar di kelas ini.\n\n_Ketik `Tambah PJ [Nama] Matkul [Matkul] WA [Nomor]` untuk menambahkan._");

            let t = "👮‍♂️ *LIST PENANGGUNG JAWAB (PJ) KELAS*\n";
            resRows.forEach((p, i) => {
                const linkWa = p.wa && p.wa.length > 5 ? `wa.me/${p.wa}` : '-';
                const matkulName = bersihkanTeks(p.matkul);
                const infoWaktu = p.hari ? ` (${p.hari}, ${formatTimeDisplay(p.jam_mulai)} WIB)` : '';
                const dosenStr = p.dosen && p.dosen !== '-' ? ` | Dosen: ${p.dosen}` : '';
                t += `\n${i + 1}. *${matkulName}*${infoWaktu}\n    👤 PJ: *${bersihkanTeks(p.nama)}*\n    📱 WA: ${linkWa}${dosenStr}\n`;
            });
            t += `\n_💡 Semua PJ yang terdaftar memiliki hak akses untuk mengelola tugas & jadwal kelas._`;
            msg.reply(t);
            break;
        }

        case 'pj.hapus': {
            if (!isAdmin) return msg.reply(replyAI('bukan_admin'));

            let targetKelasId = groupSettings?.id;
            if (!targetKelasId) {
                const resK = await pool.query(`SELECT id FROM kelas WHERE group_id_wa = $1 LIMIT 1`, [idGrup]);
                if (resK.rows.length > 0) targetKelasId = resK.rows[0].id;
            }

            if (!targetKelasId) {
                return msg.reply('⚠️ Grup ini belum terhubung ke kelas manapun.');
            }

            const num = textClean.match(/\d+/);
            if (!num) return msg.reply("⚠️ Contoh: *Hapus PJ 1*");

            const idx = parseInt(num[0]) - 1;
            let resRows = [];
            try {
                const res = await pool.query('SELECT * FROM pj WHERE kelas_id = $1 ORDER BY id ASC', [targetKelasId]);
                resRows = res.rows;
            } catch (err) {
                resRows = [];
            }

            const target = resRows[idx];
            if (!target) return msg.reply("❌ Nomor PJ tidak ditemukan.");

            await pool.query('DELETE FROM pj WHERE id = $1 AND kelas_id = $2', [target.id, targetKelasId]);
            msg.reply(`✅ PJ Matkul *${target.matkul}* (${target.nama}) berhasil dihapus.`);
            break;
        }

        case 'pj.edit': {
            if (!isAdmin) return msg.reply(replyAI('bukan_admin'));

            let targetKelasId = groupSettings?.id;
            if (!targetKelasId) {
                const resK = await pool.query(`SELECT id FROM kelas WHERE group_id_wa = $1 LIMIT 1`, [idGrup]);
                if (resK.rows.length > 0) targetKelasId = resK.rows[0].id;
            }

            if (!targetKelasId) {
                return msg.reply('⚠️ Grup ini belum terhubung ke kelas manapun.');
            }

            const cleanInput = textClean.replace(/^(edit|ubah)\s*pj\s*/i, '');
            const matchIndex = cleanInput.match(/^(\d+)/);
            if (!matchIndex) return msg.reply("⚠️ Format: *Edit PJ [No], [Perubahan]*");

            const idx = parseInt(matchIndex[1]) - 1;
            let resRows = [];
            try {
                const res = await pool.query('SELECT * FROM pj WHERE kelas_id = $1 ORDER BY id ASC', [targetKelasId]);
                resRows = res.rows;
            } catch (err) {
                resRows = [];
            }

            const target = resRows[idx];
            if (!target) return msg.reply("❌ Data PJ tidak ditemukan.");

            let changes = cleanInput.replace(/^(\d+)[,\s]*/, '').trim();
            let info = [];

            const namaB = ambilData(pesan, /(?:nama|pj)\s+(.+?)(?:,|$)/i);
            if (namaB) { target.nama = toTitleCase(bersihkanTeks(namaB)); info.push("Nama"); }

            const matkulB = ambilData(pesan, /matkul\s+(.+?)(?:,|$)/i);
            if (matkulB) { 
                target.matkul = toTitleCase(bersihkanTeks(matkulB)); 
                info.push("Matkul");
                // Cari jadwal baru
                try {
                    const resJadwalKelas = await pool.query('SELECT id_jadwal, matkul FROM jadwal WHERE kelas_id = $1', [targetKelasId]);
                    const matchedJadwal = cariJadwalPalingCocok(resJadwalKelas.rows, target.matkul);
                    if (matchedJadwal) target.id_jadwal = matchedJadwal.id_jadwal;
                } catch (e) {}
            }

            const waB = ambilData(pesan, /(?:wa|nomor)\s+(.+?)(?:,|$)/i);
            if (waB) {
                let cleanWa = waB.replace(/\D/g, '');
                if (cleanWa.startsWith('0')) cleanWa = '62' + cleanWa.slice(1);
                target.wa = cleanWa;
                info.push("WA");
            }

            if (info.length === 0) {
                target.nama = toTitleCase(bersihkanTeks(changes));
                info.push("Nama (Auto)");
            }

            await pool.query(
                `UPDATE pj SET nama = $1, matkul = $2, wa = $3, id_jadwal = $4 WHERE id = $5 AND kelas_id = $6`,
                [target.nama, target.matkul, target.wa, target.id_jadwal || null, target.id, targetKelasId]
            );

            msg.reply(`✅ *Sukses Edit PJ* (${info.join(', ')})\n\n👤 *PJ:* ${target.nama}\n📚 *Matkul:* ${target.matkul}\n📱 *WA:* ${target.wa}`);
            break;
        }

        // =======================
        // =======================
        // 📊 REKAP ABSENSI RFID MAHASISWA SESUAI TANGGAL & JADWAL HARI INI
        // =======================
        case 'absensi.lihat': {
            const isGroup = (idGrup && idGrup.endsWith('@g.us')) || (msg.from && msg.from.endsWith('@g.us'));

            // 👤 JIKA CHAT PRIBADI (JAPRI) -> CEK APAKAH PENGIRIM ADALAH DOSEN, ORANG TUA (ORTU), ATAU MAHASISWA
            if (!isGroup) {
                const senderClean = (senderNumber || msg.from || '').replace(/\D/g, '');
                const variants = [
                    senderClean,
                    senderClean.replace(/^62/, '0'),
                    senderClean.startsWith('0') ? '62' + senderClean.slice(1) : senderClean
                ].filter(Boolean);

                const now = new Date();
                const daysID = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];
                const hariIni = daysID[now.getDay()];
                const yyyy = now.getFullYear();
                const mm = String(now.getMonth() + 1).padStart(2, '0');
                const dd = String(now.getDate()).padStart(2, '0');
                const tglIniSql = `${yyyy}-${mm}-${dd}`;
                const tglDisplayHariIni = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

                // ==========================================
                // 1. 👨‍🏫 CEK APAKAH PENGIRIM ADALAH DOSEN RESMI
                // ==========================================
                const resDosen = await pool.query(
                    `SELECT * FROM dosen WHERE no_hp = ANY($1::text[])`,
                    [variants]
                );

                if (resDosen.rows.length > 0) {
                    const dosenRows = resDosen.rows;
                    const dosenNames = dosenRows.map(d => d.nama);
                    const conditions = [];
                    const params = [];
                    dosenNames.forEach(n => {
                        params.push(n);
                        const p1 = params.length;
                        const clean = n.replace(/,\s*[a-zA-Z.]+$/i, '').trim();
                        params.push(clean);
                        const p2 = params.length;
                        conditions.push(`(LOWER(j.dosen) LIKE '%' || LOWER($${p1}) || '%' OR LOWER(j.dosen) LIKE '%' || LOWER($${p2}) || '%' OR LOWER($${p1}) LIKE '%' || LOWER(j.dosen) || '%')`);
                    });

                    const resJadwalDosen = await pool.query(`
                        SELECT j.id_jadwal, j.kelas_id, j.matkul, j.dosen, j.hari, j.jam_mulai, j.jam_selesai, j.ruangan,
                               k.nama_kelas
                        FROM jadwal j
                        LEFT JOIN kelas k ON j.kelas_id = k.id
                        WHERE ${conditions.join(' OR ')}
                        ORDER BY j.jam_mulai ASC
                    `, params);

                    const semuaJadwalDosen = resJadwalDosen.rows;

                    if (semuaJadwalDosen.length === 0) {
                        await msg.reply(
                            `👨‍🏫 *Halo Bapak/Ibu Dosen (${dosenNames[0]})!*\n\n` +
                            `Nomor WhatsApp Anda terdaftar sebagai Dosen resmi, namun belum ada jadwal mata kuliah yang terhubung ke nama Anda di sistem.\n` +
                            `Silakan hubungi Admin Akademik untuk menambahkan jadwal mengajar Anda.`
                        );
                        return true;
                    }

                    // Filter jika dosen menyebutkan kelas atau matkul tertentu (misal: "absensi 2025A" atau "absensi plenger")
                    let jadwalTarget = [];

                    // 1. Cek jika dosen menyebutkan nama mata kuliah tertentu
                    const matchMatkul = semuaJadwalDosen.filter(j => 
                        j.matkul && textClean.toLowerCase().includes(j.matkul.toLowerCase().trim())
                    );
                    if (matchMatkul.length > 0) {
                        jadwalTarget = matchMatkul;
                    }

                    // 2. Cek jika dosen menyebutkan kelas tertentu (misal: 2025a, kelas b)
                    if (jadwalTarget.length === 0) {
                        const matchKelas = textClean.match(/\b(202\d[a-c]|kelas\s+[a-c])\b/i);
                        if (matchKelas) {
                            const searchK = matchKelas[0].replace(/\s+/g, '').toLowerCase();
                            jadwalTarget = semuaJadwalDosen.filter(j => (j.nama_kelas || '').toLowerCase().includes(searchK));
                        }
                    }

                    // 3. Default: Jika tidak menyebutkan matkul/kelas spesifik, kirim SEMUA mata kuliah yang diampu oleh dosen
                    if (jadwalTarget.length === 0) {
                        jadwalTarget = semuaJadwalDosen;
                    }

                    for (const j of jadwalTarget) {
                        const resMhsKelas = await pool.query(
                            `SELECT rfid_uid, nama, nim FROM mahasiswa WHERE kelas_id = $1 ORDER BY nama ASC`,
                            [j.kelas_id]
                        );
                        let listMhsKelas = resMhsKelas.rows;

                        // Fallback jika kelas di jadwal tidak memiliki mapping mahasiswa langsung (misal grup/kelas testing),
                        // atau untuk menyertakan mahasiswa yang tercatat hadir di log_absensi jadwal ini
                        const resMhsLog = await pool.query(
                            `SELECT DISTINCT m.rfid_uid, m.nama, m.nim 
                             FROM log_absensi l 
                             JOIN mahasiswa m ON l.rfid_uid = m.rfid_uid 
                             WHERE l.id_jadwal = $1 
                             ORDER BY m.nama ASC`,
                            [j.id_jadwal]
                        );

                        if (listMhsKelas.length === 0 && resMhsLog.rows.length > 0) {
                            listMhsKelas = resMhsLog.rows;
                        } else if (resMhsLog.rows.length > 0) {
                            const mhsUidSet = new Set(listMhsKelas.map(m => m.rfid_uid));
                            resMhsLog.rows.forEach(m => {
                                if (!mhsUidSet.has(m.rfid_uid)) {
                                    listMhsKelas.push(m);
                                    mhsUidSet.add(m.rfid_uid);
                                }
                            });
                            listMhsKelas.sort((a, b) => (a.nama || '').localeCompare(b.nama || ''));
                        }

                        let logTanggalTarget = tglIniSql;
                        let resLog = await pool.query(
                            `SELECT l.rfid_uid, l.waktu, l.status 
                             FROM log_absensi l 
                             WHERE l.id_jadwal = $1 AND l.tanggal = $2 
                             ORDER BY l.waktu ASC`,
                            [j.id_jadwal, tglIniSql]
                        );

                        if (resLog.rows.length === 0) {
                            const resLastDate = await pool.query(
                                `SELECT tanggal FROM log_absensi WHERE id_jadwal = $1 ORDER BY tanggal DESC LIMIT 1`,
                                [j.id_jadwal]
                            );
                            if (resLastDate.rows.length > 0) {
                                const lastDateObj = new Date(resLastDate.rows[0].tanggal);
                                const lY = lastDateObj.getFullYear();
                                const lM = String(lastDateObj.getMonth() + 1).padStart(2, '0');
                                const lD = String(lastDateObj.getDate()).padStart(2, '0');
                                logTanggalTarget = `${lY}-${lM}-${lD}`;
                                resLog = await pool.query(
                                    `SELECT l.rfid_uid, l.waktu, l.status 
                                     FROM log_absensi l 
                                     WHERE l.id_jadwal = $1 AND l.tanggal = $2 
                                     ORDER BY l.waktu ASC`,
                                    [j.id_jadwal, logTanggalTarget]
                                );
                            }
                        }

                        const logMap = new Map();
                        resLog.rows.forEach(l => {
                            logMap.set(l.rfid_uid, l);
                        });

                        const listHadirTepat = [];
                        const listTerlambat = [];
                        const listBelumHadir = [];

                        listMhsKelas.forEach(m => {
                            const log = logMap.get(m.rfid_uid);
                            if (log) {
                                const jamTap = log.waktu ? log.waktu.split('.')[0] : '-';
                                if (log.status?.toLowerCase() === 'terlambat') {
                                    listTerlambat.push({ ...m, jamTap });
                                } else {
                                    listHadirTepat.push({ ...m, jamTap });
                                }
                            } else {
                                listBelumHadir.push(m);
                            }
                        });

                // Ambil SEMUA tanggal unik pertemuan untuk jadwal ini sepanjang semester
                const resAllDates = await pool.query(`
                    SELECT DISTINCT tanggal 
                    FROM log_absensi 
                    WHERE id_jadwal = $1 
                    ORDER BY tanggal ASC
                `, [j.id_jadwal]);

                const daftarTanggal = resAllDates.rows.map(r => {
                    const d = new Date(r.tanggal);
                    const y = d.getFullYear();
                    const m = String(d.getMonth() + 1).padStart(2, '0');
                    const day = String(d.getDate()).padStart(2, '0');
                    return `${y}-${m}-${day}`;
                });

                // Ambil SEMUA log absensi untuk jadwal ini sepanjang semester
                const resAllLogs = await pool.query(`
                    SELECT rfid_uid, tanggal, waktu, status 
                    FROM log_absensi 
                    WHERE id_jadwal = $1
                `, [j.id_jadwal]);

                const allLogMap = new Map();
                resAllLogs.rows.forEach(l => {
                    const d = new Date(l.tanggal);
                    const y = d.getFullYear();
                    const m = String(d.getMonth() + 1).padStart(2, '0');
                    const day = String(d.getDate()).padStart(2, '0');
                    const key = `${l.rfid_uid}_${y}-${m}-${day}`;
                    allLogMap.set(key, l);
                });

                const totalPertemuanSemester = daftarTanggal.length;
                const totalMhs = listMhsKelas.length;
                const totalHadir = listHadirTepat.length + listTerlambat.length;
                const persenHadir = totalMhs > 0 ? Math.round((totalHadir / totalMhs) * 100) : 0;
                const tglHeader = new Date(logTanggalTarget).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

                let teks = `👨‍🏫 *REKAP PRESENSI KULIAH (DOSEN)*\n`;
                teks += `━━━━━━━━━━━━━━━━━━━━━━\n`;
                teks += `👨‍🏫 *Dosen Pengampu:* ${j.dosen}\n`;
                teks += `📚 *Mata Kuliah:* ${j.matkul}\n`;
                teks += `🏛️ *Kelas:* ${(j.nama_kelas || 'Kelas').toUpperCase()}\n`;
                teks += `🗓️ *Jadwal:* ${j.hari}, ${formatTimeDisplay(j.jam_mulai)} - ${formatTimeDisplay(j.jam_selesai)} WIB\n`;
                teks += `📅 *Tanggal Sesi Terakhir:* ${tglHeader}\n`;
                teks += `📊 *Total Pertemuan Terlaksana:* ${totalPertemuanSemester > 0 ? totalPertemuanSemester : 1} Sesi\n`;
                teks += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

                teks += `📊 *RINGKASAN SESI TERAKHIR:*\n`;
                teks += `• Total Mahasiswa: *${totalMhs} Orang*\n`;
                teks += `• Hadir: *${totalHadir} Mahasiswa* (${persenHadir}%)\n`;
                teks += `• Tepat Waktu: *${listHadirTepat.length}*\n`;
                teks += `• Terlambat: *${listTerlambat.length}*\n`;
                teks += `• Belum Hadir / Alpha: *${listBelumHadir.length}*\n\n`;

                if (listHadirTepat.length > 0) {
                    teks += `✅ *HADIR TEPAT WAKTU (${listHadirTepat.length}):*\n`;
                    listHadirTepat.forEach((m, idx) => {
                        teks += `${idx + 1}. ${m.nama} (${m.nim}) - 🕒 ${m.jamTap}\n`;
                    });
                    teks += `\n`;
                }

                if (listTerlambat.length > 0) {
                    teks += `⏳ *HADIR TERLAMBAT (${listTerlambat.length}):*\n`;
                    listTerlambat.forEach((m, idx) => {
                        teks += `${idx + 1}. ${m.nama} (${m.nim}) - 🕒 ${m.jamTap}\n`;
                    });
                    teks += `\n`;
                }

                if (listBelumHadir.length > 0) {
                    teks += `❌ *BELUM HADIR / TIDAK HADIR (${listBelumHadir.length}):*\n`;
                    listBelumHadir.forEach((m, idx) => {
                        teks += `${idx + 1}. ${m.nama} (${m.nim})\n`;
                    });
                    teks += `\n`;
                }

                teks += `━━━━━━━━━━━━━━━━━━━━━━\n`;
                teks += `_💡 Mengirimkan file Excel (.xlsx) rekapitulasi kehadiran seluruh pertemuan di bawah ini..._`;

                await msg.reply(teks);

                // Kirim File Dokumen Excel (.xlsx) Langsung ke Chat Dosen
                try {
                    const excelMedia = createExcelPresensi({
                        listMhs: listMhsKelas,
                        daftarTanggal: daftarTanggal.length > 0 ? daftarTanggal : [logTanggalTarget],
                        logMap: allLogMap,
                        infoJadwal: j
                    });
                    await msg.reply(excelMedia, undefined, {
                        caption: `📊 *File Rekapitulasi Presensi Lengkap (Excel)*\n📚 *Mata Kuliah:* ${j.matkul}\n🏛️ *Kelas:* ${(j.nama_kelas || 'Kelas').toUpperCase()}\n👨‍🏫 *Dosen:* ${j.dosen}`
                    });
                } catch (errExcel) {
                    console.error("❌ Gagal generate excel presensi:", errExcel.message);
                }
            }
            return true;
        }

        // ==========================================
        // 2. 🎓 / 👨‍👩‍👧‍👦 CEK MAHASISWA ATAU ORANG TUA (ORTU)
        // ==========================================
        let listMahasiswaTarget = [];
        let isOrtu = false;
        let namaOrtu = "";

        // Cek apakah pengirim adalah Mahasiswa
        const resMhs = await pool.query(
            `SELECT m.*, k.nama_kelas 
             FROM mahasiswa m 
             LEFT JOIN kelas k ON m.kelas_id = k.id 
             WHERE m.no_wa = ANY($1::text[])`,
            [variants]
        );

        if (resMhs.rows.length > 0) {
            listMahasiswaTarget = resMhs.rows;
        } else {
            // Cek apakah pengirim adalah Orang Tua / Wali di tabel ortu
            const resOrtu = await pool.query(
                `SELECT o.nama AS nama_ortu, m.*, k.nama_kelas
                 FROM ortu o
                 JOIN mahasiswa m ON (
                     LOWER(TRIM(o.mahasiswa_id)) = LOWER(TRIM(m.nim))
                     OR LOWER(TRIM(o.mahasiswa_id)) = LOWER(TRIM(m.rfid_uid))
                     OR LOWER(TRIM(o.mahasiswa_id)) = LOWER(TRIM(m.nama))
                 )
                 LEFT JOIN kelas k ON m.kelas_id = k.id
                 WHERE o.no_hp = ANY($1::text[])`,
                [variants]
            );

            if (resOrtu.rows.length > 0) {
                isOrtu = true;
                namaOrtu = resOrtu.rows[0].nama_ortu || "Orang Tua/Wali";
                listMahasiswaTarget = resOrtu.rows;
            }
        }

        if (listMahasiswaTarget.length === 0) {
            await msg.reply(
                `⚠️ *Nomor WhatsApp Anda belum terdaftar!*\n\n` +
                `Nomor Anda (+${senderClean}) belum terdaftar sebagai *Dosen*, *Mahasiswa*, maupun *Orang Tua/Wali* di database sistem akademik.\n\n` +
                `Silakan hubungi Admin Akademik untuk mendaftarkan nomor Anda agar dapat mengakses presensi kehadiran.`
            );
            return true;
        }

        for (const mhs of listMahasiswaTarget) {
            // 1. Ambil jadwal hari ini untuk kelas mahasiswa ini
            let daftarJadwalHariIni = [];
            if (mhs.kelas_id) {
                const resJadwalReguler = await pool.query(`
                    SELECT j.id_jadwal, j.matkul, j.hari, j.jam_mulai, j.jam_selesai, j.ruangan,
                           COALESCE(d.nama, j.dosen) AS nama_dosen
                    FROM jadwal j
                    LEFT JOIN dosen d ON (
                        LOWER(TRIM(j.dosen)) = LOWER(TRIM(d.nama))
                        OR LOWER(TRIM(j.dosen)) LIKE LOWER(TRIM(d.nama)) || '%'
                        OR LOWER(TRIM(d.nama)) LIKE LOWER(TRIM(j.dosen)) || '%'
                    )
                    WHERE j.kelas_id = $1 AND LOWER(j.hari) = $2
                    ORDER BY j.jam_mulai ASC
                `, [mhs.kelas_id, hariIni]);

                const resJadwalKhusus = await pool.query(`
                    SELECT jk.id_jadwal, jk.status_perubahan,
                           jk.jam_mulai_baru AS jam_mulai, jk.jam_selesai_baru AS jam_selesai,
                           j.matkul, COALESCE(jk.ruangan, j.ruangan, '-') AS ruangan,
                           COALESCE(d.nama, j.dosen) AS nama_dosen
                    FROM jadwal_khusus jk
                    JOIN jadwal j ON jk.id_jadwal = j.id_jadwal
                    LEFT JOIN dosen d ON (
                        LOWER(TRIM(j.dosen)) = LOWER(TRIM(d.nama))
                        OR LOWER(TRIM(j.dosen)) LIKE LOWER(TRIM(d.nama)) || '%'
                        OR LOWER(TRIM(d.nama)) LIKE LOWER(TRIM(j.dosen)) || '%'
                    )
                    WHERE j.kelas_id = $1 AND jk.tanggal_baru = $2
                `, [mhs.kelas_id, tglIniSql]);

                daftarJadwalHariIni = [...resJadwalReguler.rows, ...resJadwalKhusus.rows];
            }

            // 2. Ambil log absensi hari ini khusus mahasiswa ini
            const resLogToday = await pool.query(`
                SELECT l.tanggal, l.waktu, l.status, l.id_jadwal, j.matkul
                FROM log_absensi l
                LEFT JOIN jadwal j ON l.id_jadwal = j.id_jadwal
                WHERE l.rfid_uid = $1 AND l.tanggal = $2
                ORDER BY l.waktu ASC
            `, [mhs.rfid_uid, tglIniSql]);

            // 3. Ambil total statistik kehadiran keseluruhan semester untuk mahasiswa ini
            const resSemLogs = await pool.query(`
                SELECT status FROM log_absensi WHERE rfid_uid = $1
            `, [mhs.rfid_uid]);
            let totalHadirSem = 0;
            let totalTerlambatSem = 0;
            resSemLogs.rows.forEach(l => {
                if (l.status?.toLowerCase() === 'terlambat') totalTerlambatSem++;
                else totalHadirSem++;
            });
            const totalMasukSem = totalHadirSem + totalTerlambatSem;

            // 4. Ambil 5 riwayat kehadiran terakhir
            const resRecentLogs = await pool.query(`
                SELECT l.tanggal, l.waktu, l.status, j.matkul,
                       COALESCE(d.nama, j.dosen, '-') AS nama_dosen
                FROM log_absensi l
                LEFT JOIN jadwal j ON l.id_jadwal = j.id_jadwal
                LEFT JOIN dosen d ON (
                    LOWER(TRIM(j.dosen)) = LOWER(TRIM(d.nama))
                    OR LOWER(TRIM(j.dosen)) LIKE LOWER(TRIM(d.nama)) || '%'
                )
                WHERE l.rfid_uid = $1
                ORDER BY l.tanggal DESC, l.waktu DESC
                LIMIT 5
            `, [mhs.rfid_uid]);

            let teks = isOrtu 
                ? `👨‍👩‍👧‍👦 *LAPORAN KEHADIRAN KULIAH (UNTUK ORANG TUA)*\n`
                : `👤 *KARTU ABSENSI MAHASISWA*\n`;
            teks += `━━━━━━━━━━━━━━━━━━━━━━\n`;
            if (isOrtu) {
                teks += `🧓 *Orang Tua/Wali:* ${namaOrtu}\n`;
                teks += `👦 *Nama Mahasiswa:* ${mhs.nama}\n`;
            } else {
                teks += `📛 *Nama:* ${mhs.nama}\n`;
            }
            teks += `🎓 *NIM:* ${mhs.nim}\n`;
            teks += `🏛️ *Kelas:* ${(mhs.nama_kelas || '-').toUpperCase()}\n`;
            teks += `📅 *Tanggal:* ${tglDisplayHariIni}\n`;
            teks += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

            teks += `📊 *RINGKASAN TOTAL KEHADIRAN (SEMESTER):*\n`;
            teks += `• Total Masuk (Tap RFID): *${totalMasukSem} Kali*\n`;
            teks += `• Hadir Tepat Waktu: *${totalHadirSem} Sesi*\n`;
            teks += `• Hadir Terlambat: *${totalTerlambatSem} Sesi*\n\n`;

            teks += `📌 *STATUS KEHADIRAN HARI INI:*\n`;
            if (daftarJadwalHariIni.length > 0) {
                for (const j of daftarJadwalHariIni) {
                    const log = resLogToday.rows.find(l => l.id_jadwal === j.id_jadwal);
                    const jamSesi = `${formatTimeDisplay(j.jam_mulai)} - ${formatTimeDisplay(j.jam_selesai)} WIB`;
                    if (log) {
                        const jamTap = log.waktu ? log.waktu.split('.')[0] : '-';
                        const icon = log.status?.toLowerCase() === 'terlambat' ? '⏳' : '✅';
                        teks += `• *${j.matkul}* (${jamSesi})\n  └ 🕒 Tap: *${jamTap}* | ${icon} *${log.status || 'Hadir'}*\n`;
                    } else {
                        teks += `• *${j.matkul}* (${jamSesi})\n  └ ❌ *Belum Tap RFID / Belum Hadir*\n`;
                    }
                }
            } else if (resLogToday.rows.length > 0) {
                for (const log of resLogToday.rows) {
                    const jamTap = log.waktu ? log.waktu.split('.')[0] : '-';
                    const icon = log.status?.toLowerCase() === 'terlambat' ? '⏳' : '✅';
                    teks += `• *${log.matkul || 'Kuliah'}*\n  └ 🕒 Tap: *${jamTap}* | ${icon} *${log.status || 'Hadir'}*\n`;
                }
            } else {
                teks += `_Tidak ada jadwal perkuliahan atau riwayat tap hari ini._\n`;
            }

            if (resRecentLogs.rows.length > 0) {
                teks += `\n📋 *5 RIWAYAT KEHADIRAN TERAKHIR:*\n`;
                resRecentLogs.rows.forEach((log, idx) => {
                    const tgl = new Date(log.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
                    const jamTap = log.waktu ? log.waktu.split('.')[0] : '-';
                    const icon = log.status?.toLowerCase() === 'terlambat' ? '⏳' : '✅';
                    teks += `${idx + 1}. *${log.matkul || 'Matkul'}* (${tgl})\n   └ 🕒 ${jamTap} | ${icon} ${log.status || 'Hadir'}\n`;
                });
            }

            teks += `\n━━━━━━━━━━━━━━━━━━━━━━\n`;
            teks += `_💡 Data absensi tersinkronisasi realtime dari Tap RFID IoT._`;

            await msg.reply(teks);
        }
        return true;
    }

    // 👥 JIKA DI GRUP -> TAMPILKAN REKAPITULASI KELAS LENGKAP
    let kelasId = groupSettings?.id;
    let kelasNamaDb = groupSettings?.nama_kelas || '';

    // 1. Cek apakah user menyebutkan kelas secara spesifik (misal: "absensi 2025A" atau "rekap absensi kelas B")
    const matchKelas = textClean.match(/\b(202\d[a-c]|kelas\s+[a-c])\b/i);
    if (matchKelas) {
        const searchKelas = matchKelas[0].replace(/\s+/g, '').toLowerCase();
        const resCariKelas = await pool.query('SELECT id, nama_kelas FROM kelas WHERE LOWER(nama_kelas) LIKE $1 LIMIT 1', [`%${searchKelas}%`]);
        if (resCariKelas.rows.length > 0) {
            kelasId = resCariKelas.rows[0].id;
            kelasNamaDb = resCariKelas.rows[0].nama_kelas;
        }
    }

    // Jika grup belum di-set kelas, coba cari kelas dari settingan atau tabel kelas
    if (!kelasId) {
        const resAnyKelas = await pool.query(`SELECT id, nama_kelas FROM kelas LIMIT 1`);
        if (resAnyKelas.rows.length > 0) {
            kelasId = resAnyKelas.rows[0].id;
            kelasNamaDb = resAnyKelas.rows[0].nama_kelas;
        }
    }

    if (!kelasId) {
        return msg.reply('⚠️ Grup ini belum terhubung ke kelas manapun. Silakan jalankan *set kelas <nama_kelas>* atau sebutkan kelasnya (contoh: *!absensi 2025A*).');
    }

    // 2. Dapatkan Hari dan Tanggal Hari Ini (WIB)
    const now = new Date();
    const daysID = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];
    const hariIni = daysID[now.getDay()];
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const tglIniSql = `${yyyy}-${mm}-${dd}`;
    const jamNowMenit = now.getHours() * 60 + now.getMinutes();

    // Filter pencarian kata kunci matkul jika user mengetikkan matkul spesifik
    const cleanMatkulQuery = textClean.replace(/^(lihat|cek|list|daftar|spill|rekap|pantau|absen|absensi|!absensi|!absen)\s*/i, '')
                                      .replace(/\b(hari ini|kemarin|besok|202\d[a-c]|kelas\s+[a-c])\b/gi, '')
                                      .trim();

    // 3. Ambil Jadwal Reguler & Jadwal Khusus untuk Kelas ini pada Hari Ini
    const resJadwalReguler = await pool.query(`
        SELECT j.id_jadwal, j.matkul, j.hari, j.jam_mulai, j.jam_selesai, j.ruangan,
               j.toleransi_keterlambatan, k.nama_kelas,
               COALESCE(d.nama, j.dosen) AS nama_dosen
        FROM jadwal j
        JOIN kelas k ON j.kelas_id = k.id
        LEFT JOIN dosen d ON (
            LOWER(TRIM(j.dosen)) = LOWER(TRIM(d.nama))
            OR LOWER(TRIM(j.dosen)) LIKE LOWER(TRIM(d.nama)) || '%'
            OR LOWER(TRIM(d.nama)) LIKE LOWER(TRIM(j.dosen)) || '%'
        )
        WHERE j.kelas_id = $1 AND LOWER(j.hari) = $2
        ORDER BY j.jam_mulai ASC
    `, [kelasId, hariIni]);

    // Cek jadwal khusus / kelas pengganti untuk tanggal hari ini
    const resJadwalKhusus = await pool.query(`
        SELECT jk.id_khusus, jk.id_jadwal, jk.status_perubahan,
               jk.jam_mulai_baru AS jam_mulai, jk.jam_selesai_baru AS jam_selesai,
               jk.tanggal_baru, j.matkul, j.toleransi_keterlambatan, k.nama_kelas,
               COALESCE(jk.ruangan, j.ruangan, '-') AS ruangan,
               COALESCE(d.nama, j.dosen) AS nama_dosen
        FROM jadwal_khusus jk
        JOIN jadwal j ON jk.id_jadwal = j.id_jadwal
        JOIN kelas k ON j.kelas_id = k.id
        LEFT JOIN dosen d ON (
            LOWER(TRIM(j.dosen)) = LOWER(TRIM(d.nama))
            OR LOWER(TRIM(j.dosen)) LIKE LOWER(TRIM(d.nama)) || '%'
            OR LOWER(TRIM(d.nama)) LIKE LOWER(TRIM(j.dosen)) || '%'
        )
        WHERE j.kelas_id = $1 AND jk.tanggal_baru = $2
    `, [kelasId, tglIniSql]);

    // Cek jika ada jadwal reguler hari ini yang dibatalkan/dipindah di jadwal_khusus
    const resStatusKhusus = await pool.query(`
        SELECT id_jadwal, status_perubahan FROM jadwal_khusus
        WHERE tanggal_asli = $1
    `, [tglIniSql]);
    const canceledJadwalIds = new Set(
        resStatusKhusus.rows
            .filter(r => r.status_perubahan && (
                r.status_perubahan.toLowerCase().includes('batal') || 
                r.status_perubahan.toLowerCase().includes('pindah') ||
                r.status_perubahan.toLowerCase().includes('ganti') ||
                r.status_perubahan.toLowerCase().includes('pengganti')
            ))
            .map(r => r.id_jadwal)
    );

    // Gabungkan daftar jadwal valid hari ini
    const daftarJadwalHariIni = [
        ...resJadwalReguler.rows.filter(j => !canceledJadwalIds.has(j.id_jadwal)).map(j => ({ ...j, tipe_sesi: 'Reguler' })),
        ...resJadwalKhusus.rows.map(jk => ({ ...jk, tipe_sesi: `Pengganti (${jk.status_perubahan || 'Khusus'})` }))
    ];

            let targetJadwal = null;
            let targetTanggalStr = tglIniSql;

            // 4. Pilih Jadwal yang Sesuai
            if (cleanMatkulQuery.length > 1) {
                targetJadwal = cariJadwalPalingCocok(daftarJadwalHariIni, cleanMatkulQuery);
                if (!targetJadwal) {
                    const resAllJadwal = await pool.query(`
                        SELECT j.*, k.nama_kelas, COALESCE(d.nama, j.dosen) AS nama_dosen
                        FROM jadwal j
                        JOIN kelas k ON j.kelas_id = k.id
                        LEFT JOIN dosen d ON (
                            LOWER(TRIM(j.dosen)) = LOWER(TRIM(d.nama))
                            OR LOWER(TRIM(j.dosen)) LIKE LOWER(TRIM(d.nama)) || '%'
                            OR LOWER(TRIM(d.nama)) LIKE LOWER(TRIM(j.dosen)) || '%'
                        )
                        WHERE j.kelas_id = $1
                    `, [kelasId]);
                    targetJadwal = cariJadwalPalingCocok(resAllJadwal.rows, cleanMatkulQuery);
                }
            } else if (daftarJadwalHariIni.length > 0) {
                let ongoing = daftarJadwalHariIni.find(j => {
                    if (!j.jam_mulai) return false;
                    const [hM, mM] = j.jam_mulai.split(':').map(Number);
                    const [hS, mS] = j.jam_selesai ? j.jam_selesai.split(':').map(Number) : [hM + 2, mM];
                    const startMin = hM * 60 + mM;
                    const endMin = hS * 60 + mS + 30;
                    return jamNowMenit >= startMin && jamNowMenit <= endMin;
                });
                targetJadwal = ongoing || daftarJadwalHariIni[0];
            }

            if (!targetJadwal) {
                const resLastLog = await pool.query(`
                    SELECT l.tanggal, l.id_jadwal, j.matkul, j.dosen, j.jam_mulai, j.jam_selesai, j.ruangan,
                           j.toleransi_keterlambatan, k.nama_kelas,
                           COALESCE(d.nama, j.dosen) AS nama_dosen
                    FROM log_absensi l
                    JOIN jadwal j ON l.id_jadwal = j.id_jadwal
                    JOIN kelas k ON j.kelas_id = k.id
                    LEFT JOIN dosen d ON (
                        LOWER(TRIM(j.dosen)) = LOWER(TRIM(d.nama))
                        OR LOWER(TRIM(j.dosen)) LIKE LOWER(TRIM(d.nama)) || '%'
                        OR LOWER(TRIM(d.nama)) LIKE LOWER(TRIM(j.dosen)) || '%'
                    )
                    WHERE j.kelas_id = $1
                    ORDER BY l.tanggal DESC, l.waktu DESC LIMIT 1
                `, [kelasId]);

                if (resLastLog.rows.length > 0) {
                    targetJadwal = resLastLog.rows[0];
                    const rawDate = targetJadwal.tanggal;
                    targetTanggalStr = rawDate instanceof Date ? rawDate.toISOString().split('T')[0] : String(rawDate).split('T')[0];
                } else {
                    const tglDisplayHariIni = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
                    return msg.reply(`📭 *Tidak ada jadwal kuliah hari ini (${tglDisplayHariIni}) untuk kelas ${kelasNamaDb.toUpperCase() || 'ini'}* dan belum ada riwayat absensi RFID yang tercatat.`);
                }
            }

            // 5. Query Log Absensi Sesuai Tanggal dan Jadwal Terpilih
            const resLog = await pool.query(`
                SELECT l.id, l.tanggal, l.waktu, l.rfid_uid, l.id_jadwal, l.status,
                       m.nama AS nama_mhs, m.nim, m.kelas_id
                FROM log_absensi l
                JOIN mahasiswa m ON l.rfid_uid = m.rfid_uid
                WHERE l.id_jadwal = $1 AND l.tanggal = $2
                ORDER BY l.waktu ASC
            `, [targetJadwal.id_jadwal, targetTanggalStr]);

            const resMhs = await pool.query(`
                SELECT rfid_uid, nama, nim FROM mahasiswa 
                WHERE kelas_id = $1 
                ORDER BY nama ASC
            `, [kelasId]);

            const allStudents = resMhs.rows;
            const sessionRows = resLog.rows;
            const attendedUids = new Set(sessionRows.map(r => r.rfid_uid));

            const listHadir = sessionRows;
            const listBelumHadir = allStudents.filter(s => !attendedUids.has(s.rfid_uid));

            const tglDisplay = new Date(targetTanggalStr).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
            const isToday = targetTanggalStr === tglIniSql;
            const matkulNama = targetJadwal.matkul || 'Mata Kuliah';
            const dosenNama = targetJadwal.nama_dosen && targetJadwal.nama_dosen !== '-' ? targetJadwal.nama_dosen : 'Dosen Pengampu';
            const kelasNama = targetJadwal.nama_kelas ? targetJadwal.nama_kelas.toUpperCase() : (kelasNamaDb ? kelasNamaDb.toUpperCase() : '-');
            const ruangNama = targetJadwal.ruangan || '-';
            const jamMulai = targetJadwal.jam_mulai ? formatTimeDisplay(targetJadwal.jam_mulai) : '-';
            const jamSelesai = targetJadwal.jam_selesai ? formatTimeDisplay(targetJadwal.jam_selesai) : '-';
            const toleransiMenit = (targetJadwal.toleransi_keterlambatan !== null && targetJadwal.toleransi_keterlambatan !== undefined) ? `${targetJadwal.toleransi_keterlambatan} Menit` : '15 Menit';

            let teks = `📊 *REKAPITULASI ABSENSI KELAS* 📊\n`;
            teks += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            teks += `🏛️ *Kelas:* ${kelasNama}\n`;
            teks += `📚 *Mata Kuliah:* ${matkulNama}\n`;
            teks += `👨‍🏫 *Dosen:* ${dosenNama}\n`;
            teks += `📅 *Hari, Tanggal:* ${tglDisplay} ${isToday ? '_(HARI INI)_' : ''}\n`;
            teks += `⏰ *Jam Sesi:* ${jamMulai} - ${jamSelesai} WIB (R. ${ruangNama})\n`;
            teks += `⏱️ *Toleransi Keterlambatan:* ${toleransiMenit}\n\n`;

            teks += `👥 *STATISTIK KEHADIRAN:*\n`;
            teks += `✅ Hadir (Tap): *${listHadir.length}* Mahasiswa\n`;
            teks += `❌ Belum Hadir / Belum Tap: *${listBelumHadir.length}* Mahasiswa\n`;
            teks += `📊 Total Mahasiswa Kelas: *${allStudents.length}* Mahasiswa\n`;
            teks += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

            if (listHadir.length > 0) {
                teks += `📝 *DAFTAR MAHASISWA HADIR:* (${listHadir.length})\n`;
                listHadir.forEach((row, idx) => {
                    const jamTap = row.waktu ? row.waktu.split('.')[0] : '-';
                    const iconStatus = row.status?.toLowerCase() === 'terlambat' ? '⏳' : '✅';
                    teks += `${idx + 1}. [${row.nim}] *${row.nama_mhs || row.nama}*\n   🕒 Tap: ${jamTap} | ${iconStatus} ${row.status || 'Hadir'}\n`;
                });
            } else {
                teks += `📝 *DAFTAR MAHASISWA HADIR:* (0)\n_Belum ada mahasiswa yang melakukan tap RFID pada sesi ini._\n`;
            }

            if (listBelumHadir.length > 0) {
                teks += `\n❌ *BELUM HADIR / BELUM TAP:* (${listBelumHadir.length})\n`;
                listBelumHadir.forEach((m, idx) => {
                    teks += `${idx + 1}. [${m.nim}] ${m.nama}\n`;
                });
            }

            if (daftarJadwalHariIni.length > 1) {
                const otherMatkul = daftarJadwalHariIni.filter(j => j.id_jadwal !== targetJadwal.id_jadwal).map(j => j.matkul).join(', ');
                teks += `\n💡 _Matkul lain hari ini: ${otherMatkul}. Ketik "!absensi <matkul>" untuk melihat matkul tersebut._\n`;
            }

            teks += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            teks += `_💡 Data absensi tersinkronisasi realtime dari perangkat Tap RFID IoT._\n`;
            teks += `🏛️ *Official S1 Kecerdasan Artifisial UNESA*`;

            await msg.reply(teks);

            // Kirim Excel Rekapitulasi Presensi Semester
            try {
                const resAllDates = await pool.query(`
                    SELECT DISTINCT tanggal 
                    FROM log_absensi 
                    WHERE id_jadwal = $1 
                    ORDER BY tanggal ASC
                `, [targetJadwal.id_jadwal]);

                const daftarTanggal = resAllDates.rows.map(r => {
                    const d = new Date(r.tanggal);
                    const y = d.getFullYear();
                    const m = String(d.getMonth() + 1).padStart(2, '0');
                    const day = String(d.getDate()).padStart(2, '0');
                    return `${y}-${m}-${day}`;
                });

                const resAllLogs = await pool.query(`
                    SELECT rfid_uid, tanggal, waktu, status 
                    FROM log_absensi 
                    WHERE id_jadwal = $1
                `, [targetJadwal.id_jadwal]);

                const allLogMap = new Map();
                resAllLogs.rows.forEach(l => {
                    const d = new Date(l.tanggal);
                    const y = d.getFullYear();
                    const m = String(d.getMonth() + 1).padStart(2, '0');
                    const day = String(d.getDate()).padStart(2, '0');
                    const key = `${l.rfid_uid}_${y}-${m}-${day}`;
                    allLogMap.set(key, l);
                });

                const excelMedia = createExcelPresensi({
                    listMhs: allStudents,
                    daftarTanggal: daftarTanggal.length > 0 ? daftarTanggal : [targetTanggalStr],
                    logMap: allLogMap,
                    infoJadwal: targetJadwal
                });

                await msg.reply(excelMedia, undefined, {
                    caption: `📊 *File Rekapitulasi Presensi (Excel)*\n📚 *Mata Kuliah:* ${matkulNama}\n🏛️ *Kelas:* ${kelasNama}\n👨‍🏫 *Dosen:* ${dosenNama}`
                });
            } catch (errExcel) {
                console.error("❌ Gagal generate excel di grup:", errExcel.message);
            }

            break;
        }

        default:
            return false;
    }
    return true;
};

// =======================
// ⏰ PENGINGAT CRON DOSEN (SQL POSTGRESQL)
// =======================
const kirimReminderDosenHMin1Dinamis = async (client, pool) => {
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

    const sekarang = new Date();
    const jamSekarang = sekarang.getHours().toString().padStart(2, '0');
    const menitSekarang = sekarang.getMinutes().toString().padStart(2, '0');
    const waktuSekarangStr = `${jamSekarang}:${menitSekarang}`;

    const besokObj = new Date();
    besokObj.setDate(besokObj.getDate() + 1);
    const hariBesok = days[besokObj.getDay()];
    const tglBesokStr = besokObj.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });

    try {
        const resGrup = await pool.query('SELECT chat_id FROM kelas');

        for (const row of resGrup.rows) {
            const idGrup = row.chat_id;

            // A. JADWAL SEMENTARA
            const resSmt = await pool.query('SELECT * FROM jadwal_sementara WHERE chat_id = $1', [idGrup]);
            const sementaraBesok = resSmt.rows.filter(js => {
                if (!js.timestamp) return false;
                const targetWaktu = new Date(parseInt(js.timestamp));
                const targetTglStr = targetWaktu.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
                const targetJam = targetWaktu.getHours().toString().padStart(2, '0');
                const targetMenit = targetWaktu.getMinutes().toString().padStart(2, '0');

                return (targetTglStr === tglBesokStr) && (`${targetJam}:${targetMenit}` === waktuSekarangStr);
            });

            const matkulSementaraBesokList = [];

            for (const js of sementaraBesok) {
                let matkulNama = js.matkul || 'Mata Kuliah';
                let dosenNama = js.dosen || '-';
                matkulSementaraBesokList.push(matkulNama.toLowerCase().trim());

                const resDosen = await pool.query(
                    `SELECT * FROM dosen WHERE chat_id = $1 AND (LOWER(nama) LIKE $2 OR LOWER(matkul) = $3) LIMIT 1`,
                    [idGrup, `%${dosenNama.toLowerCase()}%`, matkulNama.toLowerCase()]
                );
                const dosen = resDosen.rows[0];

                if (dosen && dosen.wa && dosen.wa !== '-') {
                    let teks = `Hallo Bapak/Ibu *${dosen.nama}*,\n\n`;
                    teks += `Mengingatkan kembali, besok terdapat *Jadwal Tambahan/Sementara*:\n`;
                    teks += `📚 *Matkul/Kegiatan:* ${matkulNama}\n`;
                    teks += `⏰ *Waktu:* ${js.jam}\n`;
                    if (js.menggantikan_tanggal) teks += `🔄 *Menggantikan Tanggal:* ${js.menggantikan_tanggal}\n`;
                    teks += `\nTerima kasih. _(Pesan otomatis Bot)_\nS1 Kecerdasan Artifisial`;

                    try {
                        const waDosen = dosen.wa.includes('@c.us') ? dosen.wa : `${dosen.wa}@c.us`;
                        await client.sendMessage(waDosen, teks);
                    } catch (err) { }
                }
            }

            // B. JADWAL REGULER
            const resJadwal = await pool.query(
                `SELECT * FROM jadwal WHERE chat_id = $1 AND LOWER(hari) = $2`,
                [idGrup, hariBesok.toLowerCase()]
            );

            const jadwalBesok = resJadwal.rows.filter(j => {
                const jamKuliahRaw = j.jam.split('-')[0].replace('.', ':').trim();
                const matchesJam = jamKuliahRaw.startsWith(waktuSekarangStr);
                const isDuplikat = matkulSementaraBesokList.some(mSmt => mSmt.includes(j.matkul.toLowerCase().trim()));

                return matchesJam && !isDuplikat;
            });

            for (const j of jadwalBesok) {
                const resDosen = await pool.query(
                    `SELECT * FROM dosen WHERE chat_id = $1 AND LOWER(matkul) = $2 LIMIT 1`,
                    [idGrup, j.matkul.toLowerCase()]
                );
                const dosen = resDosen.rows[0];

                if (dosen && dosen.wa && dosen.wa !== '-') {
                    let teks = `📢 *PENGINGAT KULIAH BESOK (H-1)*\n\n`;
                    teks += `Hallo Bapak/Ibu *${dosen.nama}*,\n`;
                    teks += `Mengingatkan kembali, besok (*${hariBesok}*) terdapat jadwal perkuliahan:\n`;
                    teks += `📚 *Matkul:* ${j.matkul}\n`;
                    teks += `⏰ *Jam:* ${j.jam}\n\n`;
                    teks += `S1 Kecerdasan Artifisial`;

                    try {
                        const waDosen = dosen.wa.includes('@c.us') ? dosen.wa : `${dosen.wa}@c.us`;
                        await client.sendMessage(waDosen, teks);
                    } catch (err) { }
                }
            }
        }
    } catch (e) {
        console.error("❌ Error Reminder Dosen:", e.message);
    }
};

module.exports = { 
    handleAkademikLogic, 
    kirimReminderDosenHMin1Dinamis,
    ekstrakWaktuJadwal,
    ekstrakHariJadwal,
    formatTimeSql,
    formatTimeDisplay,
    cariJadwalPalingCocok,
    similarityScore,
    ekstrakMatkulDanDosen
};