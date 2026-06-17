// lib/logic_akademik.js
const { simpanData } = require('./database');
const { replyAI, deteksiWaktu, formatTanggal, ambilData, toTitleCase, showTugasNatural } = require('./utils');
// --- HELPER BARU: KOREKSI HARI ---
const koreksiHari = (dateObj, text) => {
    if (!dateObj || !text) return dateObj;
    
    const days = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];
    const lower = text.toLowerCase();
    
    // Cari hari apa yang disebut user
    let targetDay = -1;
    for (let i = 0; i < days.length; i++) {
        if (new RegExp(`\\b${days[i]}\\b`).test(lower)) {
            targetDay = i;
            break;
        }
    }

    if (targetDay === -1) return dateObj; 

    // Hitung selisih hari & update tanggal
    const currentDay = dateObj.getDay();
    let diff = targetDay - currentDay;
    if (diff < 0) diff += 7; // Kalau harinya lewat, ambil minggu depan
    
    const newDate = new Date(dateObj);
    newDate.setDate(dateObj.getDate() + diff);
    
    return newDate;
};

const handleAkademikLogic = async (intent, context) => {
    const { msg, textClean, isAdmin, db, idGrup, result, pesan } = context;

    switch (intent) {
        // =======================
        // 📚 BAGIAN TUGAS
        // =======================
        case 'tugas.tambah':
            if (!isAdmin) return msg.reply(replyAI('bukan_admin'));
            
            // Logic Deteksi Waktu & Data
            const waktuAI = deteksiWaktu(pesan);
            
            // Jika waktu terdeteksi valid
            if (waktuAI) {
                const toleransi = new Date(); 
                toleransi.setHours(toleransi.getHours() - 1);
                
                if (waktuAI < toleransi) return msg.reply(replyAI('gagal_waktu', { tanggal: formatTanggal(waktuAI) }));

                // Ekstraksi Data (Menggunakan entities dari NLP jika ada, atau regex fallback)
                let matkul = (result.entities && result.entities.find(e => e.entity === 'isi_tugas')?.option) || 
                             ambilData(pesan, /tambah tugas\s+([^,]+)/i) || 
                             textClean.split(' ').slice(0, 3).join(' ');

                let detail = ambilData(pesan, /\bdetail(?:nya)?\s+([^,]+)/i) || "Via Chat";
                let tempat = ambilData(pesan, /\btempat\s+([^,]+)/i) || "-";
                let format = ambilData(pesan, /\bformat\s+([^,]+)/i) || "Rapi";
                const tglStr = formatTanggal(waktuAI);

                // Simpan ke DB
                db[idGrup].tugas.push({
                    matkul: toTitleCase(matkul),
                    detail: toTitleCase(detail),
                    tempat: toTitleCase(tempat),
                    format: toTitleCase(format),
                    deadline: tglStr
                });
                simpanData(db);
                msg.reply(replyAI('sukses_tugas', { matkul: toTitleCase(matkul), deadline: tglStr }));
            } else {
                msg.reply("⚠️ Format tanggal tidak terbaca. Coba: 'Tambah tugas MTK deadline besok jam 10'");
            }
            break;

        case 'tugas.lihat':
            showTugasNatural(msg, db[idGrup].tugas, textClean);
            break;

        case 'tugas.hapus_pilih':
            if (!isAdmin) return msg.reply(replyAI('bukan_admin'));
            
            let entityNomor = result.entities && result.entities.find(e => e.entity === 'nomor_tugas');
            if (!entityNomor || !entityNomor.option) return msg.reply("⚠️ Sebutkan nomor tugas yang mau dihapus. Contoh: 'Hapus tugas 1'");

            let nomorHapus = entityNomor.option.map(n => parseInt(n));
            let tugasList = db[idGrup].tugas;

            if (tugasList.length === 0) return msg.reply("Zonk! Gak ada tugas yang bisa dihapus.");

            let sisaTugas = tugasList.filter((val, index) => !nomorHapus.includes(index + 1));
            
            if (sisaTugas.length === tugasList.length) {
                msg.reply("⚠️ Nomor tugas tidak ditemukan/salah.");
            } else {
                let jumlahDihapus = tugasList.length - sisaTugas.length;
                db[idGrup].tugas = sisaTugas;
                simpanData(db);
                msg.reply(`✅ Berhasil menghapus ${jumlahDihapus} tugas.`);
            }
            break;
        
        case 'tugas.hapus_confirm':
            if (!isAdmin) return msg.reply(replyAI('bukan_admin'));
            msg.reply("⚠️ Untuk menghapus, sebutkan nomornya. Contoh: *'Hapus tugas 1'* atau *'Hapus tugas 1, 2'*");
            break;

        // =======================
        // 📅 BAGIAN JADWAL
        // =======================
case 'jadwal.lihat':
            if (db[idGrup].jadwal.length === 0) return msg.reply("📅 Jadwal kosong melompong.");
            
            let t = "📅 *JADWAL KULIAH*\n";
            let currentHari = "";
            
            // Loop pakai index (i) biar muncul nomornya
            db[idGrup].jadwal.forEach((x, i) => {
                // Cek ganti hari
                if (x.hari.toUpperCase() !== currentHari) {
                    t += `\n🗓️ *${x.hari.toUpperCase()}*\n`; 
                    currentHari = x.hari.toUpperCase();
                }
                // TAMPILKAN NOMOR URUT [i+1]
                t += `[${i + 1}] ⏰ ${x.jam} | ${toTitleCase(x.matkul)}\n`+`    👨‍🏫 ${toTitleCase(x.dosen)}\n`;
            });
            
            t += `\nℹ️ *Info:* Ketik "Hapus jadwal 1, 2" untuk menghapus.`;
            msg.reply(t);
            break;

        case 'jadwal.hapus':
            if (!isAdmin) return msg.reply(replyAI('bukan_admin'));

            // 1. Ambil semua angka dari pesan user
            // Contoh input: "hapus jadwal 1, 2, 5" -> ketemu ['1', '2', '5']
            const numbersFound = textClean.match(/\d+/g);

            if (!numbersFound) {
                return msg.reply("⚠️ Sebutkan nomor jadwal yang mau dihapus.\nContoh: *'Hapus jadwal 1, 3'*");
            }

            // 2. Konversi ke integer
            const idsToDelete = numbersFound.map(n => parseInt(n));
            const jadwalList = db[idGrup].jadwal;

            if (jadwalList.length === 0) return msg.reply("Zonk! Jadwal udah kosong.");

            // 3. Filter Jadwal (Hanya simpan yang ID-nya TIDAK ada di list hapus)
            // Logika: Kita keep item jika (index + 1) TIDAK ADA di dalam idsToDelete
            const sisaJadwal = jadwalList.filter((val, index) => !idsToDelete.includes(index + 1));

            // 4. Cek hasil penghapusan
            const jumlahDihapus = jadwalList.length - sisaJadwal.length;

            if (jumlahDihapus > 0) {
                db[idGrup].jadwal = sisaJadwal;
                simpanData(db);
                msg.reply(`✅ Sukses menghapus *${jumlahDihapus}* jadwal.`);
            } else {
                msg.reply("⚠️ Nomor jadwal tidak ditemukan. Cek lagi list jadwalnya.");
            }
            break;

        case 'jadwal.tambah':
            // ... (Kode tambah jadwal biarkan seperti sebelumnya) ...
            if (!isAdmin) return msg.reply(replyAI('bukan_admin'));
            // ... copy paste logic tambah jadwal yang sudah ada ...
             const m_jadwal = ambilData(pesan, /matkul\s+(.+?)(?=\s+(?:dosen|hari|jam)|$)/i) || 
                             ambilData(pesan, /jadwal\s+(.+?)(?=\s+(?:dosen|hari|jam)|$)/i);
            const d_jadwal = ambilData(pesan, /dosen\s+(.+?)(?=\s+(?:hari|jam)|$)/i) || "-";
            const h_jadwal = ambilData(pesan, /hari\s+(.+?)(?=\s+(?:jam)|$)/i);
            const j_jadwal = ambilData(pesan, /jam\s+(.+?)(?=$)/i);

            if (m_jadwal && h_jadwal && j_jadwal) {
                db[idGrup].jadwal.push({
                    matkul: toTitleCase(m_jadwal),
                    dosen: toTitleCase(d_jadwal),
                    hari: toTitleCase(h_jadwal),
                    jam: j_jadwal
                });
                
                const urutanHari = { "Senin":1, "Selasa":2, "Rabu":3, "Kamis":4, "Jumat":5, "Sabtu":6, "Minggu":7 };
                db[idGrup].jadwal.sort((a,b) => (urutanHari[a.hari] || 8) - (urutanHari[b.hari] || 8));

                simpanData(db);
                msg.reply(`✅ *Jadwal Disimpan!* ${toTitleCase(m_jadwal)} (${toTitleCase(h_jadwal)} ${j_jadwal})`);
            } else {
                msg.reply("⚠️ Format salah. Contoh: 'Tambah jadwal Matkul A Dosen B Hari Senin Jam 08:00'");
            }
            break;
            // =======================
        // ✏️ EDIT TUGAS
        // =======================
        // =======================
        // ✏️ EDIT TUGAS (METODE KEYWORD PASTI)
        // =======================
// =======================
        // ✏️ EDIT TUGAS (FIX URUTAN & DEADLINE)
        // =======================
        case 'tugas.edit': {
            if (!isAdmin) return msg.reply(replyAI('bukan_admin'));

            // 1. Ambil Nomor Tugas
            const cleanInput = textClean.replace(/^(edit|ubah|ganti)\s*tugas\s*/i, '');
            const matchIndex = cleanInput.match(/^(\d+)/);
            
            if (!matchIndex) return msg.reply("⚠️ Format: *Edit tugas [Nomor], [Perubahan]*\nContoh: _Edit tugas 1, Format HVS_");
            
            const index = parseInt(matchIndex[1]) - 1;
            
            // Validasi nomor tugas
            if (index < 0 || index >= db[idGrup].tugas.length) {
                return msg.reply(`❌ Tugas nomor ${matchIndex[1]} tidak ditemukan.`);
            }

            // 2. Bersihkan Input (Buang angka depan)
            let changes = cleanInput.replace(/^(\d+)[,\s]*/, '').trim(); 
            if (!changes) return msg.reply("⚠️ Masukkan apa yang mau diubah.");

            let task = db[idGrup].tugas[index];
            
            // --- PENTING: DEKLARASI INI HARUS DI ATAS LOGIKA UPDATE ---
            let infoUpdate = []; 
            // ---------------------------------------------------------

            // --- LOGIKA UPDATE PER FIELD ---

            // A. Update FORMAT
            const matchFormat = changes.match(/\b(?:format|kertas)\s+(.+?)(?:,|$)/i);
            if (matchFormat) {
                task.format = toTitleCase(matchFormat[1].trim());
                infoUpdate.push("Format");
            }

            // B. Update TEMPAT
            const matchTempat = changes.match(/\b(?:tempat|lokasi|ruang)\s+(.+?)(?:,|$)/i);
            if (matchTempat) {
                task.tempat = toTitleCase(matchTempat[1].trim());
                infoUpdate.push("Tempat");
            }

            // C. Update DETAIL
            const matchDetail = changes.match(/\b(?:detail|ket|keterangan)\s+(.+?)(?:,|$)/i);
            if (matchDetail) {
                task.detail = toTitleCase(matchDetail[1].trim());
                infoUpdate.push("Detail");
            }
            
            // D. Update MATKUL
            const matchMatkul = changes.match(/\b(?:matkul|judul|pelajaran)\s+(.+?)(?:,|$)/i);
            if (matchMatkul) {
                task.matkul = toTitleCase(matchMatkul[1].trim());
                infoUpdate.push("Matkul");
            }

            // E. Update DEADLINE (Dengan Koreksi Hari)
            const matchDeadline = changes.match(/\bdeadline\s+(.+?)(?:,|$)/i);
            
            if (matchDeadline) {
                let w = deteksiWaktu(matchDeadline[1]);
                if (w) {
                    w = koreksiHari(w, matchDeadline[1]); // Koreksi hari manual
                    task.deadline = formatTanggal(w);
                    infoUpdate.push("Deadline");
                }
            }

            // F. FALLBACK (Jika tidak ada keyword)
            if (infoUpdate.length === 0) {
                let w = deteksiWaktu(changes);
                const isTimeText = /(besok|lusa|minggu|senin|selasa|rabu|kamis|jumat|sabtu|tgl|tanggal|jam|pukul)/i.test(changes);
                
                if (w && isTimeText) {
                    w = koreksiHari(w, changes); // Koreksi hari manual
                    task.deadline = formatTanggal(w);
                    infoUpdate.push("Deadline");
                } else {
                    task.detail = changes; 
                    infoUpdate.push("Detail");
                }
            }

            // Simpan Perubahan
            db[idGrup].tugas[index] = task;
            simpanData(db);

            // Tampilkan Hasil
            msg.reply(`✅ *Sukses Edit Tugas ${matchIndex[1]}* (${infoUpdate.join(', ')}).\n\n📚 ${task.matkul}\n📝 ${task.detail}\n📂 Format: ${task.format}\n📍 Tempat: ${task.tempat}\n⏳ ${task.deadline}`);
            break;
        }
            // =======================
        // ✏️ EDIT JADWAL
        // =======================
        case 'jadwal.edit':
            if (!isAdmin) return msg.reply(replyAI('bukan_admin'));

            // 1. Cek Nomor Jadwal
            let editIdJadwal = result.entities.find(e => e.entity === 'nomor_jadwal')?.option;
            if (!editIdJadwal) return msg.reply("⚠️ Sebutkan nomor jadwal yang mau diedit. Contoh: *'Ubah jadwal 2 jam 10:00'*");

            let indexJadwal = parseInt(editIdJadwal) - 1;
            let listJadwal = db[idGrup].jadwal;

            if (!listJadwal[indexJadwal]) return msg.reply(`❌ Jadwal nomor ${editIdJadwal} tidak ditemukan.`);

            // 2. Cek Apa yang Mau Diedit
            let jadwalLama = listJadwal[indexJadwal];
            let updateJadwal = false;
            let infoUpdate = [];

            // A. Edit Jam
            // Mau angka, titik, spasi, DAN strip (-)
            const jamBaru = ambilData(pesan, /jam\s+([0-9.:\s-]+)/i)?.trim();
            if (jamBaru) {
                jadwalLama.jam = jamBaru;
                updateJadwal = true;
                infoUpdate.push("Jam");
            }

            // B. Edit Hari
            const hariBaru = ambilData(pesan, /hari\s+([a-zA-Z]+)/i);
            if (hariBaru) {
                jadwalLama.hari = toTitleCase(hariBaru);
                updateJadwal = true;
                infoUpdate.push("Hari");
            }

            // C. Edit Matkul
            const mkBaru = ambilData(pesan, /matkul\s+([^,]+)/i);
            if (mkBaru) {
                jadwalLama.matkul = toTitleCase(mkBaru);
                updateJadwal = true;
                infoUpdate.push("Matkul");
            }

            // D. Edit Dosen
            const dsBaru = ambilData(pesan, /dosen\s+([^,]+)/i);
            if (dsBaru) {
                jadwalLama.dosen = toTitleCase(dsBaru);
                updateJadwal = true;
                infoUpdate.push("Dosen");
            }

            if (updateJadwal) {
                // Re-Sort Jadwal (karena hari/jam mungkin berubah)
                db[idGrup].jadwal[indexJadwal] = jadwalLama;
                
                const urutanHari = { "Senin":1, "Selasa":2, "Rabu":3, "Kamis":4, "Jumat":5, "Sabtu":6, "Minggu":7 };
                db[idGrup].jadwal.sort((a,b) => (urutanHari[a.hari] || 8) - (urutanHari[b.hari] || 8));

                simpanData(db);
                msg.reply(`✅ *Sukses Edit Jadwal ${editIdJadwal}* (${infoUpdate.join(', ')}).\n\n🗓️ ${jadwalLama.hari}, ${jadwalLama.jam}\n📚 ${jadwalLama.matkul}`);
            } else {
                msg.reply("⚠️ Tidak ada perubahan.\nGunakan kata kunci: *hari*, *jam*, *matkul*, atau *dosen*.\nContoh: _'Ubah jadwal 3 jam 13:00'_");
            }
            break;
            // =======================
        // ⏳ JADWAL SEMENTARA (AUTO DELETE)
        // =======================
        
        case 'jadwal_sementara.tambah': {
            if (!isAdmin) return msg.reply(replyAI('bukan_admin'));

            // 1. Deteksi Waktu (Wajib ada tanggal/jam yang jelas)
            let waktu = deteksiWaktu(pesan);
            
            // Koreksi hari (biar kalau bilang "Jumat" jatuhnya Jumat depan/terdekat)
            if (waktu) waktu = koreksiHari(waktu, pesan);

            if (!waktu) {
                return msg.reply("⚠️ Masukkan tanggal/hari yang jelas.\nContoh: *'Jadwal sementara KP MTK hari Jumat jam 10'*");
            }

            // Cek apakah waktu sudah lewat?
            if (waktu < new Date()) {
                return msg.reply("⚠️ Tanggal tersebut sudah lewat, tidak bisa disimpan.");
            }

            // 2. Ambil Nama Kegiatan/Matkul
            // Hapus kata kunci perintah, ambil sisanya
            let isi = textClean
                .replace(/^(tambah|input)?\s*jadwal\s*(sementara|tambahan)/i, '') // Hapus command
                .replace(/(besok|lusa|minggu|senin|selasa|rabu|kamis|jumat|sabtu|tgl|tanggal|jam|pukul).*/i, '') // Hapus bagian waktu di belakang
                .trim();

            if (!isi) isi = "Kegiatan Tambahan";

            // 3. Simpan dengan format Timestamp agar mudah dicek
            db[idGrup].jadwal_sementara.push({
                kegiatan: toTitleCase(isi),
                waktu_display: formatTanggal(waktu), // String untuk ditampilkan
                timestamp: waktu.getTime() // Angka untuk cek kadaluarsa
            });

            // Urutkan berdasarkan waktu terdekat
            db[idGrup].jadwal_sementara.sort((a, b) => a.timestamp - b.timestamp);
            
            simpanData(db);
            msg.reply(`✅ *Jadwal Sementara Disimpan!*\n📌 ${toTitleCase(isi)}\n⏳ ${formatTanggal(waktu)}\n\n_Data ini akan otomatis hilang setelah waktunya lewat._`);
            break;
        }

        case 'jadwal_sementara.lihat': {
            // 1. AUTO CLEANUP (Hapus yang sudah lewat)
            const now = Date.now();
            const initialCount = db[idGrup].jadwal_sementara.length;
            
            // Filter: Hanya simpan yang waktunya BELUM lewat
            db[idGrup].jadwal_sementara = db[idGrup].jadwal_sementara.filter(item => item.timestamp > now);
            
            // Jika ada yang dihapus, simpan database
            if (db[idGrup].jadwal_sementara.length !== initialCount) {
                simpanData(db);
            }

            // 2. Tampilkan
            if (db[idGrup].jadwal_sementara.length === 0) {
                return msg.reply("🍃 Tidak ada jadwal sementara/tambahan.");
            }

            let t = "⏳ *JADWAL SEMENTARA / TAMBAHAN*\n";
            db[idGrup].jadwal_sementara.forEach((item, i) => {
                t += `\n[${i+1}] 📌 *${item.kegiatan}*\n      🕒 ${item.waktu_display}`;
            });
            
            t += `\n\n_Otomatis dihapus jika sudah lewat._`;
            msg.reply(t);
            break;
        }
        
        // Hapus manual jika salah input
        case 'jadwal_sementara.hapus': {
            if (!isAdmin) return msg.reply(replyAI('bukan_admin'));
            
            const nums = textClean.match(/\d+/g);
            if (!nums) return msg.reply("⚠️ Contoh: *'Hapus jadwal sementara 1'*");
            
            const idxHapus = nums.map(n => parseInt(n));
            const oldLen = db[idGrup].jadwal_sementara.length;
            
            db[idGrup].jadwal_sementara = db[idGrup].jadwal_sementara.filter((_, i) => !idxHapus.includes(i+1));
            
            simpanData(db);
            msg.reply(`✅ Menghapus ${oldLen - db[idGrup].jadwal_sementara.length} item.`);
            break;
        }
        // =======================
        // 👨‍🏫 MENU DOSEN
        // =======================
        case 'dosen.tambah': {
    if (!isAdmin) return msg.reply(replyAI('bukan_admin'));

    // Regex gw update biar berhenti otomatis kalau ketemu koma atau kata kunci matkul/wa
    let nama = ambilData(pesan, /(?:nama|dosen)\s+(.+?)(?=\s*(?:,|matkul|wa|whatsapp)|$)/i);
    let matkul = ambilData(pesan, /matkul\s+(.+?)(?=\s*(?:,|wa|whatsapp)|$)/i) || "Umum";
    let waRaw = ambilData(pesan, /(?:wa|whatsapp)\s*([0-9]+)/i) || "-";

    if (nama) {
        // Bersihkan tanda koma di akhir (kalau user ngetik "dosen Bahlil,")
        nama = nama.replace(/,$/, '').trim();
        matkul = matkul.replace(/,$/, '').trim();

        // Otomatis ubah awalan '0' jadi '62' buat kebutuhan WA bot / Cron
        let waFix = waRaw;
        if (waFix !== "-" && waFix.startsWith('0')) {
            waFix = '62' + waFix.substring(1);
        }

        // Push ke database
        db[idGrup].dosen.push({
            nama: toTitleCase(nama),
            matkul: toTitleCase(matkul),
            wa: waFix
        });
        
        simpanData(db);

        // Balasan rapi tanpa embel-embel tele
        msg.reply(`✅ *Data Dosen Disimpan!*\n👨‍🏫 ${toTitleCase(nama)}\n📚 ${toTitleCase(matkul)}\n📱 WA: ${waFix}`);
    } else {
        msg.reply("⚠️ Format: *Tambah dosen [Nama], matkul [Matkul], wa [Nomor WA]*");
    }
    break;
}

        case 'dosen.lihat': {
            if (db[idGrup].dosen.length === 0) return msg.reply("👨‍🏫 Belum ada data dosen.");
            
            let t = "👨‍🏫 *DATA DOSEN*\n";
            db[idGrup].dosen.forEach((d, i) => {
                const linkWa = d.wa !== '-' ? `https://wa.me/${d.wa}` : '-';
                t += `\n${i+1}. *${d.nama}*\n    📚 ${d.matkul}\n    ✈️ ${linkWa}`;
            });
            msg.reply(t);
            break;
        }

        case 'dosen.hapus': {
            if (!isAdmin) return msg.reply(replyAI('bukan_admin'));
            const num = textClean.match(/\d+/);
            if (!num) return msg.reply("⚠️ Contoh: *Hapus dosen 1*");

            const idx = parseInt(num[0]) - 1;
            if (idx < 0 || idx >= db[idGrup].dosen.length) return msg.reply("❌ Nomor tidak ditemukan.");

            const deleted = db[idGrup].dosen.splice(idx, 1);
            simpanData(db);
            msg.reply(`✅ Dosen *${deleted[0].nama}* dihapus.`);
            break;
        }

        case 'dosen.edit': {
            if (!isAdmin) return msg.reply(replyAI('bukan_admin'));
            
            // 1. Ambil Nomor
            const cleanInput = textClean.replace(/^(edit|ubah)\s*dosen\s*/i, '');
            const matchIndex = cleanInput.match(/^(\d+)/);
            if (!matchIndex) return msg.reply("⚠️ Format: *Edit dosen [No], [Perubahan]*\nContoh: _Edit dosen 1, Matkul Jaringan_");

            const idx = parseInt(matchIndex[1]) - 1;
            if (idx < 0 || idx >= db[idGrup].dosen.length) return msg.reply("❌ Data tidak ditemukan.");

            // 2. Ambil Perubahan
            let changes = cleanInput.replace(/^(\d+)[,\s]*/, '').trim();
            if (!changes) return msg.reply("⚠️ Masukkan data yg mau diubah.");

            let data = db[idGrup].dosen[idx];
            let info = [];

            // Update Field
            const namaB = ambilData(pesan, /(?:nama|dosen)\s+(.+?)(?:,|$)/i);
            if (namaB) { data.nama = toTitleCase(namaB); info.push("Nama"); }

            const matkulB = ambilData(pesan, /matkul\s+(.+?)(?:,|$)/i);
            if (matkulB) { data.matkul = toTitleCase(matkulB); info.push("Matkul"); }

            const teleB = ambilData(pesan, /(?:tele|username)\s+(.+?)(?:,|$)/i);
            if (teleB) { data.tele = teleB.replace('@', '').trim(); info.push("Tele"); }

            // Fallback (jika user cuma nulis "Edit dosen 1, Jaringan Komputer") -> Update Matkul
            if (info.length === 0) {
                 data.matkul = toTitleCase(changes);
                 info.push("Matkul (Auto)");
            }

            db[idGrup].dosen[idx] = data;
            simpanData(db);
            msg.reply(`✅ *Sukses Edit Dosen* (${info.join(', ')}).\n👨‍🏫 ${data.nama}\n📚 ${data.matkul}\n✈️ ${data.tele}`);
            break;
        }

        // =======================
        // 👮‍♂️ MENU PJ (PENANGGUNG JAWAB)
        // =======================
        case 'pj.tambah': {
            if (!isAdmin) return msg.reply(replyAI('bukan_admin'));

            // Format: Tambah PJ Nama [A] Matkul [B] WA [C]
            const nama = ambilData(pesan, /(?:nama|pj)\s+(.+?)(?=\s+(?:matkul|wa|nomor)|$)/i);
            const matkul = ambilData(pesan, /matkul\s+(.+?)(?=\s+(?:wa|nomor)|$)/i) || "Umum";
            const wa = ambilData(pesan, /(?:wa|nomor|no)\s+(.+?)(?=$)/i) || "-";

            if (nama) {
                // Bersihkan nomor WA (biar jadi format wa.me/62...)
                let cleanWa = wa.replace(/\D/g, '');
                if (cleanWa.startsWith('0')) cleanWa = '62' + cleanWa.slice(1);

                db[idGrup].pj.push({
                    nama: toTitleCase(nama),
                    matkul: toTitleCase(matkul),
                    wa: cleanWa
                });
                simpanData(db);
                msg.reply(`✅ *Data PJ Disimpan!*\n👮‍♂️ ${toTitleCase(nama)}\n📚 ${toTitleCase(matkul)}\n📱 wa.me/${cleanWa}`);
            } else {
                msg.reply("⚠️ Format: *Tambah PJ [Nama] Matkul [Matkul] WA [Nomor]*");
            }
            break;
        }

        case 'pj.lihat': {
            if (db[idGrup].pj.length === 0) return msg.reply("👮‍♂️ Belum ada data PJ.");
            
            let t = "👮‍♂️ *LIST PENANGGUNG JAWAB (PJ)*\n";
            db[idGrup].pj.forEach((p, i) => {
                const linkWa = p.wa.length > 5 ? `wa.me/${p.wa}` : '-';
                t += `\n${i+1}. *${p.matkul}*\n    👤 ${p.nama}\n    📱 ${linkWa}`;
            });
            msg.reply(t);
            break;
        }

        case 'pj.hapus': {
            if (!isAdmin) return msg.reply(replyAI('bukan_admin'));
            const num = textClean.match(/\d+/);
            if (!num) return msg.reply("⚠️ Contoh: *Hapus PJ 1*");

            const idx = parseInt(num[0]) - 1;
            if (idx < 0 || idx >= db[idGrup].pj.length) return msg.reply("❌ Nomor tidak ditemukan.");

            const deleted = db[idGrup].pj.splice(idx, 1);
            simpanData(db);
            msg.reply(`✅ PJ Matkul *${deleted[0].matkul}* dihapus.`);
            break;
        }

        case 'pj.edit': {
            if (!isAdmin) return msg.reply(replyAI('bukan_admin'));
            
            const cleanInput = textClean.replace(/^(edit|ubah)\s*pj\s*/i, '');
            const matchIndex = cleanInput.match(/^(\d+)/);
            if (!matchIndex) return msg.reply("⚠️ Format: *Edit PJ [No], [Perubahan]*\nContoh: _Edit PJ 1, WA 0812345_");

            const idx = parseInt(matchIndex[1]) - 1;
            if (idx < 0 || idx >= db[idGrup].pj.length) return msg.reply("❌ Data tidak ditemukan.");

            let changes = cleanInput.replace(/^(\d+)[,\s]*/, '').trim();
            if (!changes) return msg.reply("⚠️ Masukkan data yg mau diubah.");

            let data = db[idGrup].pj[idx];
            let info = [];

            const namaB = ambilData(pesan, /(?:nama|pj)\s+(.+?)(?:,|$)/i);
            if (namaB) { data.nama = toTitleCase(namaB); info.push("Nama"); }

            const matkulB = ambilData(pesan, /matkul\s+(.+?)(?:,|$)/i);
            if (matkulB) { data.matkul = toTitleCase(matkulB); info.push("Matkul"); }

            const waB = ambilData(pesan, /(?:wa|nomor)\s+(.+?)(?:,|$)/i);
            if (waB) { 
                let cleanWa = waB.replace(/\D/g, '');
                if (cleanWa.startsWith('0')) cleanWa = '62' + cleanWa.slice(1);
                data.wa = cleanWa; 
                info.push("WA"); 
            }

            if (info.length === 0) {
                 // Fallback update nama kalau gak ada keyword
                 data.nama = toTitleCase(changes);
                 info.push("Nama (Auto)");
            }

            db[idGrup].pj[idx] = data;
            simpanData(db);
            msg.reply(`✅ *Sukses Edit PJ* (${info.join(', ')}).\n👤 ${data.nama}\n📚 ${data.matkul}\n📱 ${data.wa}`);
            break;
        }

        default:
            return false;
    }
    return true;
};
const kirimReminderDosenHMin1Dinamis = async (client, db) => {
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    
    // 1. Ambil Waktu Saat Ini (Jam dan Menit sekarang)
    const sekarang = new Date();
    const jamSekarang = sekarang.getHours().toString().padStart(2, '0');
    const menitSekarang = sekarang.getMinutes().toString().padStart(2, '0');
    const waktuSekarangStr = `${jamSekarang}:${menitSekarang}`; // Contoh: "10:15"

    // 2. Dapatkan Hari Besok & Tanggal Besok
    const besokObj = new Date();
    besokObj.setDate(besokObj.getDate() + 1);
    const hariBesok = days[besokObj.getDay()]; // Contoh: "Kamis"
    const tglBesokStr = besokObj.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }); // "18/06/2026"

    // 3. Loop semua grup di database
    for (const idGrup in db) {
        const grup = db[idGrup];
        if (!grup.jadwal && !grup.jadwal_sementara) continue;

        // ==========================================
        // A. JADWAL REGULER (Cek Hari & Jam Kuliah)
        // ==========================================
        const jadwalBesok = (grup.jadwal || []).filter(j => {
            const matchesHari = j.hari.toLowerCase() === hariBesok.toLowerCase();
            
            // Bersihkan format jam di DB user (misal: "08:00 - 10:00" atau "08.00" -> ambil "08:00")
            const jamKuliahRaw = j.jam.split('-')[0].replace('.', ':').trim(); 
            const matchesJam = jamKuliahRaw.startsWith(waktuSekarangStr);

            return matchesHari && matchesJam;
        });

        // Jalankan pengiriman untuk Jadwal Reguler yang match jamnya
        for (const j of jadwalBesok) {
            const dosen = (grup.dosen || []).find(d => d.matkul.toLowerCase() === j.matkul.toLowerCase());
            if (dosen && dosen.wa && dosen.wa !== '-') {
                let teks = `Hallo Bapak/Ibu *${dosen.nama}*,\n\n`;
                teks += `Mengingatkan kembali, besok (*${hariBesok}*) terdapat jadwal perkuliahan pada jam yang sama:\n`;
                teks += `📚 *Matkul:* ${j.matkul}\n`;
                teks += `⏰ *Jam:* ${j.jam}\n\n`;
                teks += `Mohon kehadirannya Bapak/Ibu. Terima kasih. _(Pesan otomatis Bot)_`;

                try {
                    const waDosen = dosen.wa.includes('@c.us') ? dosen.wa : `${dosen.wa}@c.us`;
                    await client.sendMessage(waDosen, teks);
                    console.log(`[CRON-MATCH] Reminder reguler terkirim ke ${dosen.nama} pada jam ${waktuSekarangStr}`);
                } catch (err) {
                    console.error(`[CRON] Gagal kirim ke ${dosen.nama}:`, err.message);
                }
            }
        }

        // ==================================================
        // B. JADWAL SEMENTARA (Cek Tanggal Besok & Jam Kuliah)
        // ==================================================
        const sementaraBesok = (grup.jadwal_sementara || []).filter(js => {
            // Cek apakah data memiliki timestamp valid
            if (!js.timestamp) return false;
            
            const targetWaktu = new Date(js.timestamp);
            
            // Cek apakah tanggalnya bertepatan dengan esok hari
            const targetTglStr = targetWaktu.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
            const matchesTanggal = targetTglStr === tglBesokStr;

            // Cek apakah jam dan menitnya sama dengan menit saat ini
            const targetJam = targetWaktu.getHours().toString().padStart(2, '0');
            const targetMenit = targetWaktu.getMinutes().toString().padStart(2, '0');
            const matchesJam = `${targetJam}:${targetMenit}` === waktuSekarangStr;

            return matchesTanggal && matchesJam;
        });

        // Jalankan pengiriman untuk Jadwal Sementara yang match jamnya
        for (const js of sementaraBesok) {
            const dosen = (grup.dosen || []).find(d => d.matkul.toLowerCase() === js.kegiatan.toLowerCase());
            if (dosen && dosen.wa && dosen.wa !== '-') {
                let teks = `Hallo Bapak/Ibu *${dosen.nama}*,\n\n`;
                teks += `Mengingatkan kembali, besok terdapat *Jadwal Tambahan/Sementara* di jam yang sama:\n`;
                teks += `📌 *Kegiatan/Matkul:* ${js.kegiatan}\n`;
                teks += `🕒 *Waktu:* ${js.waktu_display}\n\n`;
                teks += `Terima kasih. _(Pesan otomatis Bot)_`;
                teks += `S1 Kecerdasan Aritifisial `;


                try {
                    const waDosen = dosen.wa.includes('@c.us') ? dosen.wa : `${dosen.wa}@c.us`;
                    await client.sendMessage(waDosen, teks);
                    console.log(`[CRON-MATCH] Reminder sementara terkirim ke ${dosen.nama} pada jam ${waktuSekarangStr}`);
                } catch (err) {
                    console.error(`[CRON] Gagal kirim ke ${dosen.nama}:`, err.message);
                }
            }
        }
    }
};

// Pastikan di-export di paling bawah file
module.exports = { handleAkademikLogic, kirimReminderDosenHMin1Dinamis };

