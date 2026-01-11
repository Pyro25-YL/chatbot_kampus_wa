const { bacaData, simpanData } = require('./database');
const { processText } = require('./ai');
const { replyAI, deteksiWaktu, formatTanggal, ambilData, toTitleCase, showTugasNatural } = require('./utils');
const { DAFTAR_ADMIN } = require('../config');

module.exports = async (msg, client) => {
    try {
        const chat = await msg.getChat();
        const contact = await msg.getContact();
        const pesan = msg.body;
        const idGrup = chat.id._serialized;
        const isAdmin = DAFTAR_ADMIN.includes(contact.number);

        // Load Database
        let db = bacaData();
        if (!db[idGrup]) db[idGrup] = { nama: chat.name || 'Grup', tugas: [], jadwal: [] };

        // --- A. MANUAL COMMANDS (Hapus Tugas) ---
        if (pesan.startsWith('!hapus')) {
            if (!isAdmin) return msg.reply(replyAI('bukan_admin'));
            if (db[idGrup].tugas.length === 0) return msg.reply("Tidak ada tugas untuk dihapus.");
            const deleted = db[idGrup].tugas.shift();
            simpanData(db);
            return msg.reply(`🗑️ Tugas *${deleted.matkul}* berhasil dihapus oleh Admin.`);
        }
        
        // --- COMMAND HAPUS JADWAL (Tambahan) ---
        if (pesan.startsWith('!resetjadwal')) {
            if (!isAdmin) return msg.reply(replyAI('bukan_admin'));
            db[idGrup].jadwal = [];
            simpanData(db);
            return msg.reply("🗑️ Seluruh jadwal kuliah berhasil dihapus bersih.");
        }

        // --- B. TRIGGER CHECK ---
        const myNumber = client.info.wid.user; 
        const mentions = await msg.getMentions();
        const isMention = mentions.some(contact => contact.number === myNumber);
        
        let isReplyBot = false;
        if (msg.hasQuotedMsg) {
            const quotedMsg = await msg.getQuotedMessage();
            if (quotedMsg.fromMe || (quotedMsg.author && quotedMsg.author.includes(myNumber))) {
                isReplyBot = true;
            }
        }
        const isDipanggil = ['bot', 'min', 'p!'].some(x => pesan.toLowerCase().startsWith(x));
        const shouldRespond = isDipanggil || isMention || isReplyBot || pesan.startsWith('!');

        if (chat.isGroup && !shouldRespond) return;

        // Bersihkan teks
        let textClean = pesan.toLowerCase()
            .replace(/^(bot|min|p!)\s*/, '') 
            .replace(/@[\w.:@]+/g, '') 
            .trim();
        
        // Panggil AI
        const result = await processText(textClean);

        // --- C. EKSEKUSI INTENT ---
        const threshold = shouldRespond ? 0 : 0.6; 

        if (result.score > threshold || result.intent.includes('tugas') || result.intent.includes('jadwal') || shouldRespond) {
            
            switch (result.intent) {
                case 'menu.lihat':
                    const menuText = 
`🤖 *PUSAT BANTUAN BOT* 🤖

🔓 *FITUR PUBLIK*
1. Cek Tugas ("Cek tugas min")
2. Cek Jadwal ("Jadwal hari ini")
3. Tanya ("Min lagi apa?")

🔒 *ADMIN ONLY*
🛠️ *TUGAS*
• Tambah Tugas ("Tambah tugas MTK besok")
• Hapus Tugas ("!hapus")

📅 *JADWAL*
• Tambah Jadwal
  Ex: "Tambah jadwal Matkul Fisika Dosen Pak Budi Hari Senin Jam 08:00"
• Reset Jadwal
  Ex: "!resetjadwal"

⚠️ _Bot otomatis menolak jika Non-Admin mencoba fitur terkunci._`;
                    msg.reply(menuText);
                    break;

                case 'tugas.tambah':
                    if (!isAdmin) return msg.reply(replyAI('bukan_admin'));
                    const waktuAI = deteksiWaktu(pesan);
                    if (waktuAI) {
                        const toleransi = new Date(); toleransi.setHours(toleransi.getHours() - 1);
                        if (waktuAI < toleransi) return msg.reply(replyAI('gagal_waktu', { tanggal: formatTanggal(waktuAI) }));

                        let matkul = ambilData(pesan, /tambah tugas\s+([^,]+)/i);
                        if (!matkul) matkul = textClean.split(' ').slice(0, 3).join(' '); 
                        let detail = ambilData(pesan, /\bdetail(?:nya)?\s+([^,]+)/i) || "Via Chat";
                        let tempat = ambilData(pesan, /\btempat\s+([^,]+)/i) || "-";
                        let format = ambilData(pesan, /\bformat\s+([^,]+)/i) || "Rapi";
                        const tglStr = formatTanggal(waktuAI);

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
                        msg.reply(replyAI('bingung_format'));
                    }
                    break;

                case 'tugas.lihat':
                    showTugasNatural(msg, db[idGrup].tugas, textClean);
                    break;

                // ==========================================
// ==========================================
                // FITUR BARU: TAMBAH JADWAL (REVISI REGEX)
                // ==========================================
                case 'jadwal.tambah':
                    if (!isAdmin) return msg.reply(replyAI('bukan_admin'));

                    // PERBAIKAN: Regex menggunakan (?=...) agar berhenti saat ketemu kata kunci lain
                    // 1. Matkul: Ambil sampai ketemu kata dosen/hari/jam/akhir kalimat
                    const m_jadwal = ambilData(pesan, /matkul\s+(.+?)(?=\s+(?:dosen|hari|jam)|$)/i) || 
                                     ambilData(pesan, /jadwal\s+(.+?)(?=\s+(?:dosen|hari|jam)|$)/i);
                    
                    // 2. Dosen: Ambil sampai ketemu kata hari/jam/akhir kalimat
                    const d_jadwal = ambilData(pesan, /dosen\s+(.+?)(?=\s+(?:hari|jam)|$)/i) || "-";
                    
                    // 3. Hari: Ambil sampai ketemu kata jam/akhir kalimat
                    const h_jadwal = ambilData(pesan, /hari\s+(.+?)(?=\s+(?:jam)|$)/i);
                    
                    // 4. Jam: Ambil sisanya
                    const j_jadwal = ambilData(pesan, /jam\s+(.+?)(?=$)/i);

                    // Validasi Input
                    if (m_jadwal && h_jadwal && j_jadwal) {
                        db[idGrup].jadwal.push({
                            matkul: toTitleCase(m_jadwal),
                            dosen: toTitleCase(d_jadwal),
                            hari: toTitleCase(h_jadwal),
                            jam: j_jadwal
                        });
                        
                        // Urutkan jadwal berdasarkan Hari (Senin - Minggu)
                        const urutanHari = { "Senin":1, "Selasa":2, "Rabu":3, "Kamis":4, "Jumat":5, "Sabtu":6, "Minggu":7 };
                        db[idGrup].jadwal.sort((a,b) => (urutanHari[a.hari] || 8) - (urutanHari[b.hari] || 8));

                        simpanData(db);
                        msg.reply(`✅ *Jadwal Berhasil Disimpan!*\n\n📚 Matkul: ${toTitleCase(m_jadwal)}\n👨‍🏫 Dosen: ${toTitleCase(d_jadwal)}\n🗓 Hari: ${toTitleCase(h_jadwal)}\n⏰ Jam: ${j_jadwal}`);
                    } else {
                        msg.reply("⚠️ Format salah bos!\n\nContoh yang benar:\n_\"Tambah jadwal Matkul Algoritma Dosen Pak Budi Hari Senin Jam 08:00\"_");
                    }
                    break;

// ==========================================
                // UPDATE: LIHAT JADWAL (TAMPILAN LEBIH RAPI)
                // ==========================================
                case 'jadwal.lihat':
                    if (db[idGrup].jadwal.length === 0) return msg.reply("📅 Jadwal belum diisi admin. Minta admin ketik 'Tambah jadwal...' dulu.");
                    
                    let t = "📅 *JADWAL KULIAH*\n";
                    
                    let currentHari = "";
                    
                    db[idGrup].jadwal.forEach((x) => {
                        // Cek apakah ganti hari? Kalau iya, buat Header Hari baru
                        if (x.hari.toUpperCase() !== currentHari) {
                            t += `\n➖➖➖➖➖➖➖➖➖➖\n`;
                            t += `🗓️ *${x.hari.toUpperCase()}*\n`; 
                            currentHari = x.hari.toUpperCase();
                        }

                        // Baris 1: Jam & Matkul
                        t += `⏰ ${x.jam} | *${toTitleCase(x.matkul)}*\n`;
                        
                        // Baris 2: Dosen (Hanya tampil jika ada isinya & bukan "-")
                        if (x.dosen && x.dosen !== "-" && x.dosen.toLowerCase() !== "via chat") {
                            t += `   👨‍🏫 ${toTitleCase(x.dosen)}\n`;
                        }
                    });
                    
                    t += `➖➖➖➖➖➖➖➖➖➖`;
                    msg.reply(t);
                    break;

                default:
                    if (result.answer) msg.reply(result.answer);
                    else msg.reply("Hadir bos! Ada yang bisa dibantu? Ketik 'Menu' kalau bingung. 🫡");
            }
        }
    } catch (err) {
        console.error("Error di handler:", err);
    }
};