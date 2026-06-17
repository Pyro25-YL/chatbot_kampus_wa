const cron = require('node-cron');
const { bacaData, simpanData } = require('./database');

// --- KONFIGURASI ---
const CRON_INTERVAL_MINUTES = 1; 
const DELETE_BUFFER_MS = 60 * 1000; 

const REMINDER_TIERS = [
    { label: '3 Hari Lagi', ms: 3 * 24 * 60 * 60 * 1000 },
    { label: '2 Hari Lagi', ms: 2 * 24 * 60 * 60 * 1000 },
    { label: '1 Hari Lagi', ms: 24 * 60 * 60 * 1000 },
    { label: '6 Jam Lagi',  ms: 6 * 60 * 60 * 1000 },
    { label: '3 Jam Lagi',  ms: 3 * 60 * 60 * 1000 },
    { label: '2 Jam Lagi',  ms: 2 * 60 * 60 * 1000 },
    { label: '1 Jam Lagi',  ms: 1 * 60 * 60 * 1000 },
    { label: '30 Menit Lagi', ms: 30 * 60 * 1000 }
];

const ID_MONTHS = {
    'januari': 0, 'februari': 1, 'maret': 2, 'april': 3, 'mei': 4, 'juni': 5,
    'juli': 6, 'agustus': 7, 'september': 8, 'oktober': 9, 'november': 10, 'desember': 11,
    'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'mei': 4, 'jun': 5,
    'jul': 6, 'agu': 7, 'sep': 8, 'okt': 9, 'nov': 10, 'des': 11
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

// --- LOGIC UTAMA ---
const startCron = (client) => {
    console.log(`✅ CRON JOB AKTIF: Cek Tugas & Cek Match Jam Dosen (Setiap 1 Menit)`);

    cron.schedule(`*/${CRON_INTERVAL_MINUTES} * * * *`, async () => {
        try {
            const now = new Date();
            const jamSekarang = now.getHours().toString().padStart(2, '0');
            const menitSekarang = now.getMinutes().toString().padStart(2, '0');
            const waktuSekarangStr = `${jamSekarang}:${menitSekarang}`; 
            
            console.log(`[${waktuSekarangStr}] 🔄 Cron running: Mengecek tugas & jadwal dosen...`);

            // Data untuk filter besok
            const esok = new Date();
            esok.setDate(esok.getDate() + 1);
            const namaHariID = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];
            const hariEsok = namaHariID[esok.getDay()];
            const tglEsokStr = esok.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }); 

            const db = bacaData();
            let totalChanges = 0;

            for (const chatId in db) {
                const group = db[chatId];

                // ==========================================
                // BAGIAN A: REMINDER TUGAS & AUTO DELETE
                // ==========================================
                if (group.tugas && group.tugas.length > 0) {
                    let keptTasks = []; 
                    let groupChanged = false;

                    for (const task of group.tugas) {
                        const dlDate = parseDeadline(task.deadline);
                        if (!dlDate) { keptTasks.push(task); continue; }

                        const diffMs = dlDate.getTime() - now.getTime();
                        if (diffMs < -DELETE_BUFFER_MS) {
                            groupChanged = true; totalChanges++; continue; 
                        }
                        keptTasks.push(task);

                        for (const tier of REMINDER_TIERS) {
                            if (diffMs <= tier.ms && diffMs > (tier.ms - 60000)) {
                                const pesan = `🚨 *REMINDER TUGAS* 🚨\n\n📌 *Matkul:* ${task.matkul}\n⏳ *Status:* ${tier.label}\n📅 *Deadline:* ${task.deadline}\n\n_Segera dikerjakan ya guys!_`;
                                await client.sendMessage(chatId, pesan).catch(e => {});
                                break;
                            }
                        }
                    }
                    if (groupChanged) group.tugas = keptTasks;
                }

                // ==========================================
                // BAGIAN B: REMINDER DOSEN REAL-TIME (JAM SAMA)
                // ==========================================
                
                // 1. Cek Jadwal Rutin Besok
                // ==========================================
// BAGIAN B: REMINDER DOSEN REAL-TIME (JAM SAMA)
// ==========================================

// 1. Cek Jadwal Rutin Besok
        if (group.jadwal && group.jadwal.length > 0) {
            console.log(`[DEBUG] Menghitung untuk hari besok: ${hariEsok} | Jam sekarang: ${waktuSekarangStr}`);

            const jBesokMatch = group.jadwal.filter(j => {
                const matchesHari = j.hari.toLowerCase() === hariEsok;
                const jamKuliahRaw = j.jam.split('-')[0].replace('.', ':').trim();
                const matchesJam = jamKuliahRaw.startsWith(waktuSekarangStr);
                
                // 🚨 LOG DEBUG BARU
                console.log(`[DEBUG_MATCH] Cek Jadwal: ${j.matkul} | Hari di DB: ${j.hari.toLowerCase()} vs Target: ${hariEsok} (${matchesHari}) | Jam di DB: ${jamKuliahRaw} vs Target: ${waktuSekarangStr} (${matchesJam})`);
                
                return matchesHari && matchesJam;
            });

            for (const j of jBesokMatch) {
                const dosen = group.dosen?.find(d => {
                    const matkulJadwalClean = j.matkul.toLowerCase().replace(/[.,]/g, '').trim();
                    const matkulDosenClean = d.matkul.toLowerCase().replace(/[.,]/g, '').trim();
                    return matkulJadwalClean === matkulDosenClean && d.wa;
                });

                if (!dosen) {
                    console.log(`[DEBUG_WARN] Jadwal cocok tapi DOSEN/WA tidak ditemukan untuk matkul: ${j.matkul}`);
                }

                if (dosen) {
                    let pesan = `*PENGINGAT KULIAH BESOK (H-1)*\n\nHalo Bapak/Ibu *${dosen.nama}*,\n\nMengingatkan kembali bahwa besok (*${hariEsok.toUpperCase()}*) terdapat jadwal perkuliahan Anda di jam yang sama:\n\n📚 *Matkul:* ${dosen.matkul}\n⏰ *Jam:* ${j.jam}\n\n_Mohon kehadirannya ya Pak/Bu, terima kasih._`;
                    const waDosen = dosen.wa.includes('@c.us') ? dosen.wa : `${dosen.wa}@c.us`;
                    await client.sendMessage(waDosen, pesan).catch(e => {
                        console.log(`[DEBUG_ERROR] Gagal kirim WA ke ${dosen.nama}:`, e.message);
                    });
                    console.log(`✅ [MATCH-JAM] Reminder rutin dikirim ke ${dosen.nama} pada jam ${waktuSekarangStr}`);
                }
            }
        }

                // 2. Cek Jadwal Sementara Besok
                if (group.jadwal_sementara && group.jadwal_sementara.length > 0) {
                    const sBesokMatch = group.jadwal_sementara.filter(js => {
                        if (!js.timestamp) return false;
                        const targetWaktu = new Date(js.timestamp);
                        
                        const targetTglStr = targetWaktu.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
                        const matchesTanggal = targetTglStr === tglEsokStr;

                        const targetJam = targetWaktu.getHours().toString().padStart(2, '0');
                        const targetMenit = targetWaktu.getMinutes().toString().padStart(2, '0');
                        const matchesJam = `${targetJam}:${targetMenit}` === waktuSekarangStr;

                        return matchesTanggal && matchesJam;
                    });

                    for (const s of sBesokMatch) {
                        // FIX: Menggunakan s.kegiatan (bukan j.matkul) dan fitur Kebal Typo
                        const dosen = group.dosen?.find(d => {
                            const kegiatanSementaraClean = s.kegiatan.toLowerCase().replace(/[.,]/g, '').trim();
                            const matkulDosenClean = d.matkul.toLowerCase().replace(/[.,]/g, '').trim();
                            return kegiatanSementaraClean === matkulDosenClean && d.wa;
                        });

                        if (dosen) {
                            let pesan = `*PENGINGAT JADWAL SEMENTARA BESOK (H-1)*\n\nHalo Bapak/Ibu *${dosen.nama}*,\n\nMengingatkan kembali bahwa besok terdapat kelas tambahan/sementara di jam yang sama:\n\n📌 *Kegiatan:* ${s.kegiatan}\n🕒 *Waktu:* ${s.waktu_display}\n\n_Mohon kehadirannya ya Pak/Bu, terima kasih._`;
                            const waDosen = dosen.wa.includes('@c.us') ? dosen.wa : `${dosen.wa}@c.us`;
                            await client.sendMessage(waDosen, pesan).catch(e => {});
                            console.log(`✅ [MATCH-JAM] Reminder sementara dikirim ke ${dosen.nama} pada jam ${waktuSekarangStr}`);
                        }
                    }
                }
            }

            if (totalChanges > 0) simpanData(db);
        } catch (err) { console.error("❌ [CRON ERROR]", err); }
    }, { scheduled: true, timezone: "Asia/Jakarta" });
};

module.exports = { startCron };