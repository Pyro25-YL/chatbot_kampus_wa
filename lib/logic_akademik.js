const { replyAI, deteksiWaktu, formatTanggal, ambilData, toTitleCase, showTugasNatural } = require('./utils');

// --- HELPER SANITASI TEKS ---
const bersihkanTeks = (str) => str ? str.replace(/[,.]+$|^[,.]+|\s+[,.]+/g, '').replace(/\s+/g, ' ').trim() : '';

// --- HELPER KOREKSI HARI ---
const koreksiHari = (dateObj, text) => {
    if (!dateObj || !text) return dateObj;

    const days = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];
    const lower = text.toLowerCase();

    let targetDay = -1;
    for (let i = 0; i < days.length; i++) {
        if (new RegExp(`\\b${days[i]}\\b`).test(lower)) {
            targetDay = i;
            break;
        }
    }

    if (targetDay === -1) return dateObj;

    const currentDay = dateObj.getDay();
    let diff = targetDay - currentDay;
    if (diff < 0) diff += 7;

    const newDate = new Date(dateObj);
    newDate.setDate(dateObj.getDate() + diff);

    return newDate;
};

// --- HELPER FUZZY SIMILARITY & PENCOCOKAN MATKUL/JADWAL (TOLERAN TYPO & SINGKATAN) ---
function similarityScore(s1, s2) {
    if (!s1 || !s2) return 0;
    const str1 = s1.toLowerCase().trim();
    const str2 = s2.toLowerCase().trim();
    if (str1 === str2) return 1.0;
    if (str1.includes(str2) || str2.includes(str1)) return 0.85;

    const getBigrams = (str) => {
        const bigrams = new Set();
        for (let i = 0; i < str.length - 1; i++) {
            bigrams.add(str.substring(i, i + 2));
        }
        return bigrams;
    };
    
    const b1 = getBigrams(str1);
    const b2 = getBigrams(str2);
    let intersection = 0;
    for (const bg of b1) {
        if (b2.has(bg)) intersection++;
    }
    
    const total = b1.size + b2.size;
    return total === 0 ? 0 : (2.0 * intersection) / total;
}

function cariJadwalPalingCocok(daftarJadwal, inputMatkul) {
    if (!daftarJadwal || daftarJadwal.length === 0) return null;
    if (!inputMatkul) return daftarJadwal[0];
    
    const target = inputMatkul.toLowerCase().trim();

    // 1. Exact match / Contains
    let match = daftarJadwal.find(j => {
        if (!j.matkul) return false;
        const mk = j.matkul.toLowerCase().trim();
        return mk === target || mk.includes(target) || target.includes(mk);
    });
    if (match) return match;

    // 2. Acronym / Singkatan (Contoh: "IMKA" -> "Interaksi Manusia dan Komputer", "FMD" -> "Fisiologi Manusia Dasar")
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

// --- HELPER EKSTRAK MENGGANTIKAN TANGGAL ---
function ekstrakMenggantikanTanggal(teks) {
    const match = teks.match(/\bmengganti(?:kan)?\s+(?:tanggal\s+)?(.+?)(?=\s+(?:jam|dosen|hari|matkul)|$)/i);
    return match ? bersihkanTeks(toTitleCase(match[1])) : null;
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
    const { msg, textClean, isAdmin, pool, idGrup, result, pesan, groupSettings } = context;

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

            const waktuAI = deteksiWaktu(pesan);
            if (waktuAI) {
                const toleransi = new Date();
                toleransi.setHours(toleransi.getHours() - 1);

                if (waktuAI < toleransi) return msg.reply(replyAI('gagal_waktu', { tanggal: formatTanggal(waktuAI) }));

                let matkul = (result.entities && result.entities.find(e => e.entity === 'isi_tugas')?.option) ||
                    ambilData(pesan, /tambah tugas\s+([^,]+)/i) ||
                    textClean.split(' ').slice(0, 3).join(' ');

                let detail = ambilData(pesan, /\bdetail(?:nya)?\s+([^,]+)/i) || "Via Chat";
                let format = ambilData(pesan, /\bformat\s+([^,]+)/i) || ambilData(pesan, /\btempat\s+([^,]+)/i) || "Rapi";
                const tglStr = formatTanggal(waktuAI);

                const cleanMatkul = toTitleCase(bersihkanTeks(matkul));
                const cleanDetail = toTitleCase(bersihkanTeks(detail));
                const cleanFormat = toTitleCase(bersihkanTeks(format));

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

                msg.reply(replyAI('sukses_tugas', { matkul: cleanMatkul, deadline: tglStr }));
            } else {
                msg.reply("⚠️ Format tanggal tidak terbaca. Coba: 'Tambah tugas MTK deadline besok jam 10'");
            }
            break;
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
                msg.reply(`✅ Berhasil menghapus ${idsToDelete.length} tugas.`);
            }
            break;
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

            if (!matchIndex) return msg.reply("⚠️ Format: *Edit tugas [Nomor], [Perubahan]*\nContoh: _Edit tugas 1, Format HVS_");

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

            const matchFormat = changes.match(/\b(?:format|kertas|pengumpulan|tempat)\s+(.+?)(?:,|$)/i);
            if (matchFormat) {
                task.pengumpulan = toTitleCase(bersihkanTeks(matchFormat[1]));
                infoUpdate.push("Format/Pengumpulan");
            }

            const matchDetail = changes.match(/\b(?:detail|ket|keterangan|deskripsi)\s+(.+?)(?:,|$)/i);
            if (matchDetail) {
                task.deskripsi = toTitleCase(bersihkanTeks(matchDetail[1]));
                infoUpdate.push("Deskripsi");
            }

            const matchMatkul = changes.match(/\b(?:matkul|judul|pelajaran|tugas)\s+(.+?)(?:,|$)/i);
            if (matchMatkul) {
                task.nama_tugas = toTitleCase(bersihkanTeks(matchMatkul[1]));
                infoUpdate.push("Nama Tugas");
            }

            const matchDeadline = changes.match(/\bdeadline\s+(.+?)(?:,|$)/i);
            if (matchDeadline) {
                let w = deteksiWaktu(matchDeadline[1]);
                if (w) {
                    w = koreksiHari(w, matchDeadline[1]);
                    task.deadline = w;
                    infoUpdate.push("Deadline");
                }
            }

            if (infoUpdate.length === 0) {
                let w = deteksiWaktu(changes);
                const isTimeText = /(besok|lusa|minggu|senin|selasa|rabu|kamis|jumat|sabtu|tgl|tanggal|jam|pukul)/i.test(changes);

                if (w && isTimeText) {
                    w = koreksiHari(w, changes);
                    task.deadline = w;
                    infoUpdate.push("Deadline");
                } else {
                    task.deskripsi = bersihkanTeks(changes);
                    infoUpdate.push("Deskripsi");
                }
            }

            await pool.query(
                `UPDATE tugas SET nama_tugas = $1, deskripsi = $2, pengumpulan = $3, deadline = $4 WHERE id = $5`,
                [task.nama_tugas || task.matkul, task.deskripsi || task.detail, task.pengumpulan || task.format, task.deadline, task.id]
            );

            const dlTampil = task.deadline instanceof Date ? task.deadline.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : task.deadline;
            msg.reply(`✅ *Sukses Edit Tugas ${matchIndex[1]}* (${infoUpdate.join(', ')})\n\n📚 *Tugas:* ${task.nama_tugas || task.matkul}\n📝 *Deskripsi:* ${task.deskripsi || task.detail || '-'}\n📂 *Pengumpulan:* ${task.pengumpulan || task.format || '-'}\n⏳ *Deadline:* ${dlTampil}`);
            break;
        }

        // =======================
        // 📅 BAGIAN JADWAL REGULER
        // =======================
        case 'jadwal.lihat': {
            const kelasId = groupSettings?.id;

            if (!kelasId) {
                return msg.reply('⚠️ Grup ini belum terhubung ke kelas manapun. Silakan ketik *set kelas <nama_kelas>* terlebih dahulu.');
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
                const jamStr = jamS ? `${jamM} - ${jamS}` : jamM;
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

                const jamTampil = jamSelesai ? `${formatTimeDisplay(jamMulai)} - ${formatTimeDisplay(jamSelesai)}` : formatTimeDisplay(jamMulai);
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

                const jamDisplay = jadwalLama.jam_selesai ? `${formatTimeDisplay(jadwalLama.jam_mulai)} - ${formatTimeDisplay(jadwalLama.jam_selesai)}` : formatTimeDisplay(jadwalLama.jam_mulai);
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

            const teksTanpaMengganti = pesan.replace(/\bmengganti(?:kan)?\s+(?:tanggal\s+)?[^,\n]+/gi, '');
            let waktu = deteksiWaktu(teksTanpaMengganti);
            if (waktu) waktu = koreksiHari(waktu, teksTanpaMengganti);

            const { jamMulai, jamSelesai } = ekstrakWaktuJadwal(pesan);
            const statusPerubahan = ambilData(pesan, /\b(?:status|keterangan)\s+([^,]+?)(?=,|$)/i) || 'Jadwal Pengganti';
            const r_jadwal = ambilData(pesan, /\b(?:ruangan|ruang|r\.)\s+([^,]+?)(?=\s+(?:status|tanggal|tgl|jam|mulai|selesai|dosen)|,|$)/i) || targetJadwal.ruangan || '-';

            let tglBaruSql = waktu ? `${waktu.getFullYear()}-${String(waktu.getMonth() + 1).padStart(2, '0')}-${String(waktu.getDate()).padStart(2, '0')}` : new Date().toISOString().split('T')[0];
            
            let tglAsliSql = null;
            const menggantikanTanggal = ekstrakMenggantikanTanggal(pesan);
            if (menggantikanTanggal) {
                const wAsli = deteksiWaktu(menggantikanTanggal);
                if (wAsli) {
                    tglAsliSql = `${wAsli.getFullYear()}-${String(wAsli.getMonth() + 1).padStart(2, '0')}-${String(wAsli.getDate()).padStart(2, '0')}`;
                }
            }

            await pool.query(
                `INSERT INTO jadwal_khusus (id_jadwal, tanggal_asli, status_perubahan, tanggal_baru, jam_mulai_baru, jam_selesai_baru, ruangan) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [idJadwal, tglAsliSql, statusPerubahan, tglBaruSql, jamMulai || '08:00:00', jamSelesai || '10:00:00', bersihkanTeks(r_jadwal)]
            );

            let pesanSukses = `✅ *Jadwal Sementara / Khusus Disimpan!*\n\n` +
                `📚 *Matkul:* ${matkulNama}\n` +
                `👨‍🏫 *Dosen:* ${dosenNama || '-'}\n` +
                `📌 *Status:* ${statusPerubahan}\n` +
                `🗓️ *Tanggal Baru:* ${tglBaruSql}\n` +
                `⏰ *Jam:* ${jamMulai ? formatTimeDisplay(jamMulai) : '08:00'} - ${jamSelesai ? formatTimeDisplay(jamSelesai) : '10:00'}\n`;
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

            const waktuB = deteksiWaktu(pesan);
            if (waktuB) {
                item.tanggal_baru = `${waktuB.getFullYear()}-${String(waktuB.getMonth() + 1).padStart(2, '0')}-${String(waktuB.getDate()).padStart(2, '0')}`;
                infoUpdate.push("Tanggal");
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
                 SET status_perubahan = $1, tanggal_baru = $2, jam_mulai_baru = $3, jam_selesai_baru = $4, ruangan = $5 
                 WHERE id_khusus = $6`,
                [item.status_perubahan, item.tanggal_baru, item.jam_mulai_baru, item.jam_selesai_baru, item.ruangan || '-', item.id_khusus]
            );

            let replyEdit = `✅ *Sukses Edit Jadwal Sementara ${index + 1}* (${infoUpdate.join(', ')})\n\n` +
                `📚 *Matkul:* ${item.matkul}\n` +
                `📌 *Status:* ${item.status_perubahan}\n` +
                `🗓️ *Tanggal Baru:* ${item.tanggal_baru}\n` +
                `⏰ *Jam:* ${item.jam_mulai_baru ? formatTimeDisplay(item.jam_mulai_baru) : '-'} - ${item.jam_selesai_baru ? formatTimeDisplay(item.jam_selesai_baru) : '-'}`;
            if (item.ruangan && item.ruangan !== '-') {
                replyEdit += `\n📍 *Ruangan:* ${item.ruangan}`;
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
                const jamStr = jamSelesai ? `${jamMulai} - ${jamSelesai}` : jamMulai;
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
                    .filter(r => r.status_perubahan && (r.status_perubahan.toLowerCase().includes('batal') || r.status_perubahan.toLowerCase().includes('pindah')))
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
                // Jika user menyebut matkul tertentu, cari yang paling cocok dari jadwal hari ini atau semua jadwal kelas
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
                // Jika ada beberapa jadwal hari ini, pilih yang SEDANG BERLANGSUNG atau yang TERDEKAT
                let sesiSedangBerlangsung = daftarJadwalHariIni.find(j => {
                    if (!j.jam_mulai) return false;
                    const [hM, mM] = j.jam_mulai.split(':').map(Number);
                    const [hS, mS] = j.jam_selesai ? j.jam_selesai.split(':').map(Number) : [hM + 2, mM];
                    const startMin = hM * 60 + mM;
                    const endMin = hS * 60 + mS + 30; // Toleransi 30 menit setelah kelas selesai
                    return jamNowMenit >= startMin && jamNowMenit <= endMin;
                });

                if (sesiSedangBerlangsung) {
                    targetJadwal = sesiSedangBerlangsung;
                } else {
                    // Jika tidak ada yang berlangsung saat ini, cari jadwal terdekat hari ini
                    daftarJadwalHariIni.sort((a, b) => {
                        const minA = a.jam_mulai ? parseInt(a.jam_mulai.split(':')[0]) * 60 + parseInt(a.jam_mulai.split(':')[1]) : 0;
                        const minB = b.jam_mulai ? parseInt(b.jam_mulai.split(':')[0]) * 60 + parseInt(b.jam_mulai.split(':')[1]) : 0;
                        return Math.abs(minA - jamNowMenit) - Math.abs(minB - jamNowMenit);
                    });
                    targetJadwal = daftarJadwalHariIni[0];
                }
            }

            // Jika hari ini tidak ada jadwal dan tidak ada query spesifik, cek apakah ada log absensi terakhir
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

            // Ambil seluruh mahasiswa di kelas tersebut
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
                    teks += `${idx + 1}. [${row.nim}] *${row.nama_mhs}*\n   🕒 Tap: ${jamTap} | ${iconStatus} ${row.status || 'Hadir'}\n`;
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

            // Tampilkan info tambahan jika ada matkul lain hari ini
            if (daftarJadwalHariIni.length > 1) {
                const otherMatkul = daftarJadwalHariIni.filter(j => j.id_jadwal !== targetJadwal.id_jadwal).map(j => j.matkul).join(', ');
                teks += `\n💡 _Matkul lain hari ini: ${otherMatkul}. Ketik "!absensi <matkul>" untuk melihat matkul tersebut._\n`;
            }

            teks += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            teks += `_💡 Data absensi tersinkronisasi realtime dari perangkat Tap RFID IoT._\n`;
            teks += `🏛️ *Official S1 Kecerdasan Artifisial UNESA*`;

            msg.reply(teks);
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