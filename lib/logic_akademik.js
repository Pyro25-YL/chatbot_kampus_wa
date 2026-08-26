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
                let tempat = ambilData(pesan, /\btempat\s+([^,]+)/i) || "-";
                let format = ambilData(pesan, /\bformat\s+([^,]+)/i) || "Rapi";
                const tglStr = formatTanggal(waktuAI);

                const cleanMatkul = toTitleCase(bersihkanTeks(matkul));
                const cleanDetail = toTitleCase(bersihkanTeks(detail));
                const cleanTempat = toTitleCase(bersihkanTeks(tempat));
                const cleanFormat = toTitleCase(bersihkanTeks(format));

                await pool.query(
                    `INSERT INTO tugas (chat_id, matkul, detail, tempat, format, deadline) 
                     VALUES ($1, $2, $3, $4, $5, $6)`,
                    [idGrup, cleanMatkul, cleanDetail, cleanTempat, cleanFormat, tglStr]
                );

                msg.reply(replyAI('sukses_tugas', { matkul: cleanMatkul, deadline: tglStr }));
            } else {
                msg.reply("⚠️ Format tanggal tidak terbaca. Coba: 'Tambah tugas MTK deadline besok jam 10'");
            }
            break;
        }

        case 'tugas.lihat': {
            const res = await pool.query('SELECT * FROM tugas WHERE chat_id = $1 ORDER BY id ASC', [idGrup]);
            showTugasNatural(msg, res.rows, textClean);
            break;
        }

        case 'tugas.hapus_pilih': {
            if (!isAdmin) return msg.reply(replyAI('bukan_admin'));

            let entityNomor = result.entities && result.entities.find(e => e.entity === 'nomor_tugas');
            if (!entityNomor || !entityNomor.option) return msg.reply("⚠️ Sebutkan nomor tugas yang mau dihapus. Contoh: 'Hapus tugas 1'");

            let nomorHapus = entityNomor.option.map(n => parseInt(n));
            const resTugas = await pool.query('SELECT id FROM tugas WHERE chat_id = $1 ORDER BY id ASC', [idGrup]);
            let tugasList = resTugas.rows;

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

            const cleanInput = textClean.replace(/^(edit|ubah|ganti)\s*tugas\s*/i, '');
            const matchIndex = cleanInput.match(/^(\d+)/);

            if (!matchIndex) return msg.reply("⚠️ Format: *Edit tugas [Nomor], [Perubahan]*\nContoh: _Edit tugas 1, Format HVS_");

            const index = parseInt(matchIndex[1]) - 1;
            const resTugas = await pool.query('SELECT * FROM tugas WHERE chat_id = $1 ORDER BY id ASC', [idGrup]);
            const task = resTugas.rows[index];

            if (!task) {
                return msg.reply(`❌ Tugas nomor ${matchIndex[1]} tidak ditemukan.`);
            }

            let changes = cleanInput.replace(/^(\d+)[,\s]*/, '').trim();
            if (!changes) return msg.reply("⚠️ Masukkan apa yang mau diubah.");

            let infoUpdate = [];

            const matchFormat = changes.match(/\b(?:format|kertas)\s+(.+?)(?:,|$)/i);
            if (matchFormat) {
                task.format = toTitleCase(bersihkanTeks(matchFormat[1]));
                infoUpdate.push("Format");
            }

            const matchTempat = changes.match(/\b(?:tempat|lokasi|ruang)\s+(.+?)(?:,|$)/i);
            if (matchTempat) {
                task.tempat = toTitleCase(bersihkanTeks(matchTempat[1]));
                infoUpdate.push("Tempat");
            }

            const matchDetail = changes.match(/\b(?:detail|ket|keterangan)\s+(.+?)(?:,|$)/i);
            if (matchDetail) {
                task.detail = toTitleCase(bersihkanTeks(matchDetail[1]));
                infoUpdate.push("Detail");
            }

            const matchMatkul = changes.match(/\b(?:matkul|judul|pelajaran)\s+(.+?)(?:,|$)/i);
            if (matchMatkul) {
                task.matkul = toTitleCase(bersihkanTeks(matchMatkul[1]));
                infoUpdate.push("Matkul");
            }

            const matchDeadline = changes.match(/\bdeadline\s+(.+?)(?:,|$)/i);
            if (matchDeadline) {
                let w = deteksiWaktu(matchDeadline[1]);
                if (w) {
                    w = koreksiHari(w, matchDeadline[1]);
                    task.deadline = formatTanggal(w);
                    infoUpdate.push("Deadline");
                }
            }

            if (infoUpdate.length === 0) {
                let w = deteksiWaktu(changes);
                const isTimeText = /(besok|lusa|minggu|senin|selasa|rabu|kamis|jumat|sabtu|tgl|tanggal|jam|pukul)/i.test(changes);

                if (w && isTimeText) {
                    w = koreksiHari(w, changes);
                    task.deadline = formatTanggal(w);
                    infoUpdate.push("Deadline");
                } else {
                    task.detail = bersihkanTeks(changes);
                    infoUpdate.push("Detail");
                }
            }

            await pool.query(
                `UPDATE tugas SET matkul = $1, detail = $2, format = $3, tempat = $4, deadline = $5 WHERE id = $6`,
                [task.matkul, task.detail, task.format, task.tempat, task.deadline, task.id]
            );

            msg.reply(`✅ *Sukses Edit Tugas ${matchIndex[1]}* (${infoUpdate.join(', ')})\n\n📚 *Matkul:* ${task.matkul}\n📝 *Detail:* ${task.detail}\n📂 *Format:* ${task.format}\n📍 *Tempat:* ${task.tempat}\n⏳ *Deadline:* ${task.deadline}`);
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
        // 👮‍♂️ MENU PJ
        // =======================
        case 'pj.tambah': {
            if (!isAdmin) return msg.reply(replyAI('bukan_admin'));

            const nama = ambilData(pesan, /(?:nama|pj)\s+(.+?)(?=\s+(?:matkul|wa|nomor)|$)/i);
            const matkul = ambilData(pesan, /matkul\s+(.+?)(?=\s+(?:wa|nomor)|$)/i) || "Umum";
            const wa = ambilData(pesan, /(?:wa|nomor|no)\s+(.+?)(?=$)/i) || "-";

            if (nama) {
                let cleanWa = wa.replace(/\D/g, '');
                if (cleanWa.startsWith('0')) cleanWa = '62' + cleanWa.slice(1);

                const cNama = toTitleCase(bersihkanTeks(nama));
                const cMatkul = toTitleCase(bersihkanTeks(matkul));

                await pool.query(
                    `INSERT INTO pj (chat_id, nama, matkul, wa) VALUES ($1, $2, $3, $4)`,
                    [idGrup, cNama, cMatkul, cleanWa]
                );

                msg.reply(`✅ *Data PJ Disimpan!*\n\n👮‍♂️ *PJ:* ${cNama}\n📚 *Matkul:* ${cMatkul}\n📱 *WA:* wa.me/${cleanWa}`);
            } else {
                msg.reply("⚠️ Format: *Tambah PJ [Nama] Matkul [Matkul] WA [Nomor]*");
            }
            break;
        }

        case 'pj.lihat': {
            const resPj = await pool.query('SELECT * FROM pj WHERE chat_id = $1 ORDER BY id ASC', [idGrup]);
            if (resPj.rows.length === 0) return msg.reply("👮‍♂️ Belum ada data PJ.");

            let t = "👮‍♂️ *LIST PENANGGUNG JAWAB (PJ)*\n";
            resPj.rows.forEach((p, i) => {
                const linkWa = p.wa.length > 5 ? `wa.me/${p.wa}` : '-';
                t += `\n${i + 1}. *${bersihkanTeks(p.matkul)}*\n    👤 ${bersihkanTeks(p.nama)}\n    📱 ${linkWa}`;
            });
            msg.reply(t);
            break;
        }

        case 'pj.hapus': {
            if (!isAdmin) return msg.reply(replyAI('bukan_admin'));
            const num = textClean.match(/\d+/);
            if (!num) return msg.reply("⚠️ Contoh: *Hapus PJ 1*");

            const idx = parseInt(num[0]) - 1;
            const resPj = await pool.query('SELECT * FROM pj WHERE chat_id = $1 ORDER BY id ASC', [idGrup]);
            const target = resPj.rows[idx];

            if (!target) return msg.reply("❌ Nomor tidak ditemukan.");

            await pool.query('DELETE FROM pj WHERE id = $1', [target.id]);
            msg.reply(`✅ PJ Matkul *${target.matkul}* dihapus.`);
            break;
        }

        case 'pj.edit': {
            if (!isAdmin) return msg.reply(replyAI('bukan_admin'));

            const cleanInput = textClean.replace(/^(edit|ubah)\s*pj\s*/i, '');
            const matchIndex = cleanInput.match(/^(\d+)/);
            if (!matchIndex) return msg.reply("⚠️ Format: *Edit PJ [No], [Perubahan]*");

            const idx = parseInt(matchIndex[1]) - 1;
            const resPj = await pool.query('SELECT * FROM pj WHERE chat_id = $1 ORDER BY id ASC', [idGrup]);
            const target = resPj.rows[idx];

            if (!target) return msg.reply("❌ Data tidak ditemukan.");

            let changes = cleanInput.replace(/^(\d+)[,\s]*/, '').trim();
            let info = [];

            const namaB = ambilData(pesan, /(?:nama|pj)\s+(.+?)(?:,|$)/i);
            if (namaB) { target.nama = toTitleCase(bersihkanTeks(namaB)); info.push("Nama"); }

            const matkulB = ambilData(pesan, /matkul\s+(.+?)(?:,|$)/i);
            if (matkulB) { target.matkul = toTitleCase(bersihkanTeks(matkulB)); info.push("Matkul"); }

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
                `UPDATE pj SET nama = $1, matkul = $2, wa = $3 WHERE id = $4`,
                [target.nama, target.matkul, target.wa, target.id]
            );

            msg.reply(`✅ *Sukses Edit PJ* (${info.join(', ')})\n\n👤 *PJ:* ${target.nama}\n📚 *Matkul:* ${target.matkul}\n📱 *WA:* ${target.wa}`);
            break;
        }

        // =======================
        // 📊 REKAP ABSENSI RFID MAHASISWA (TABEL LOG_ABSENSI)
        // =======================
        case 'absensi.lihat': {
            let kelasId = groupSettings?.id;

            // Cek apakah user menyebutkan kelas secara spesifik (misal: "absensi 2025A" atau "rekap absensi 2025B")
            const matchKelas = textClean.match(/\b(202\d[a-c]|kelas\s+[a-c])\b/i);
            if (matchKelas) {
                const searchKelas = matchKelas[0].replace(/\s+/g, '').toLowerCase();
                const resCariKelas = await pool.query('SELECT id, nama_kelas FROM kelas WHERE LOWER(nama_kelas) LIKE $1 LIMIT 1', [`%${searchKelas}%`]);
                if (resCariKelas.rows.length > 0) {
                    kelasId = resCariKelas.rows[0].id;
                }
            }

            // Jika grup belum di-set kelas, gunakan kelas dari log absensi terbaru
            if (!kelasId) {
                const resLastKelas = await pool.query(`
                    SELECT j.kelas_id FROM log_absensi l 
                    JOIN jadwal j ON l.id_jadwal = j.id_jadwal 
                    ORDER BY l.tanggal DESC, l.waktu DESC LIMIT 1
                `);
                if (resLastKelas.rows.length > 0) {
                    kelasId = resLastKelas.rows[0].kelas_id;
                }
            }

            if (!kelasId) {
                return msg.reply('⚠️ Grup ini belum terhubung ke kelas manapun. Silakan jalankan *set kelas <nama_kelas>* atau sebutkan kelasnya (contoh: *!absensi 2025A*).');
            }

            // Cek filter matkul jika ada
            const cleanMatkulQuery = textClean.replace(/^(lihat|cek|list|daftar|spill|rekap|pantau|absen|absensi|!absensi|!absen)\s*/i, '')
                                              .replace(/\b(hari ini|kemarin|besok|202\d[a-c]|kelas\s+[a-c])\b/gi, '')
                                              .trim();

            let queryLog = `
                SELECT l.id, l.tanggal, l.waktu, l.rfid_uid, l.id_jadwal, l.status,
                       m.nama AS nama_mhs, m.nim, m.kelas_id,
                       j.matkul, j.dosen, j.jam_mulai, j.jam_selesai, j.ruangan,
                       k.nama_kelas, k.id AS id_kelas
                FROM log_absensi l
                JOIN mahasiswa m ON l.rfid_uid = m.rfid_uid
                JOIN jadwal j ON l.id_jadwal = j.id_jadwal
                JOIN kelas k ON j.kelas_id = k.id
                WHERE j.kelas_id = $1
            `;
            const params = [kelasId];

            if (cleanMatkulQuery.length > 1) {
                params.push(`%${cleanMatkulQuery}%`);
                queryLog += ` AND LOWER(j.matkul) LIKE $${params.length}`;
            }

            queryLog += ` ORDER BY l.tanggal DESC, l.waktu ASC`;

            const resLog = await pool.query(queryLog, params);

            if (resLog.rows.length === 0) {
                return msg.reply("📭 *Belum ada riwayat tap absensi RFID yang tercatat untuk kelas ini.*");
            }

            // Ambil sesi tanggal & matkul paling mutakhir dari hasil query
            const latestSession = resLog.rows[0];
            const targetDateStr = latestSession.tanggal instanceof Date ? latestSession.tanggal.toISOString().split('T')[0] : String(latestSession.tanggal).split('T')[0];
            const targetJadwalId = latestSession.id_jadwal;

            // Filter data absensi pada sesi/jadwal & tanggal tersebut
            const sessionRows = resLog.rows.filter(r => {
                const rDateStr = r.tanggal instanceof Date ? r.tanggal.toISOString().split('T')[0] : String(r.tanggal).split('T')[0];
                return rDateStr === targetDateStr && r.id_jadwal === targetJadwalId;
            });

            const tglDisplay = new Date(targetDateStr).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
            const matkulNama = latestSession.matkul || 'Mata Kuliah';
            const dosenNama = latestSession.dosen && latestSession.dosen !== '-' ? latestSession.dosen : 'Dosen Pengampu';
            const kelasNama = latestSession.nama_kelas ? latestSession.nama_kelas.toUpperCase() : '-';
            const ruangNama = latestSession.ruangan || '-';
            const jamMulai = latestSession.jam_mulai ? formatTimeDisplay(latestSession.jam_mulai) : '-';
            const jamSelesai = latestSession.jam_selesai ? formatTimeDisplay(latestSession.jam_selesai) : '-';

            // Ambil semua daftar mahasiswa di kelas ini
            const resMhs = await pool.query(`
                SELECT rfid_uid, nama, nim FROM mahasiswa 
                WHERE kelas_id = $1 
                ORDER BY nama ASC
            `, [kelasId]);

            const allStudents = resMhs.rows;
            const attendedUids = new Set(sessionRows.map(r => r.rfid_uid));

            const listHadir = sessionRows;
            const listBelumHadir = allStudents.filter(s => !attendedUids.has(s.rfid_uid));

            let teks = `📊 *REKAPITULASI ABSENSI KELAS* 📊\n`;
            teks += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            teks += `🏛️ *Kelas:* ${kelasNama}\n`;
            teks += `📚 *Mata Kuliah:* ${matkulNama}\n`;
            teks += `👨‍🏫 *Dosen:* ${dosenNama}\n`;
            teks += `📅 *Hari, Tanggal:* ${tglDisplay}\n`;
            teks += `⏰ *Jam Sesi:* ${jamMulai} - ${jamSelesai} WIB (R. ${ruangNama})\n\n`;

            teks += `👥 *STATISTIK KEHADIRAN:*\n`;
            teks += `✅ Hadir: *${listHadir.length}* Mahasiswa\n`;
            teks += `❌ Belum Hadir / Alpa: *${listBelumHadir.length}* Mahasiswa\n`;
            teks += `📊 Total Mahasiswa Kelas: *${allStudents.length}* Mahasiswa\n`;
            teks += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

            teks += `📝 *DAFTAR MAHASISWA HADIR:* (${listHadir.length})\n`;
            listHadir.forEach((row, idx) => {
                const jamTap = row.waktu ? row.waktu.split('.')[0] : '-';
                const iconStatus = row.status?.toLowerCase() === 'terlambat' ? '⏳' : '✅';
                teks += `${idx + 1}. [${row.nim}] *${row.nama_mhs}*\n   🕒 Tap: ${jamTap} | ${iconStatus} ${row.status || 'Hadir'}\n`;
            });

            if (listBelumHadir.length > 0) {
                teks += `\n❌ *BELUM HADIR / BELUM TAP:* (${listBelumHadir.length})\n`;
                listBelumHadir.forEach((m, idx) => {
                    teks += `${idx + 1}. [${m.nim}] ${m.nama}\n`;
                });
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