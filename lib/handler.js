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
        const myNumber = client.info.wid.user; 
        
        // 1. BERSIHKAN TEKS (Hapus @mention bot)
        let textClean = pesan.toLowerCase()
            .replace(/^(asep|min|p!)\s*/, '') 
            .replace(/@[\w.:@]+/g, '') // Hapus tag orang/bot
            .trim();

        // Load Database
        let db = bacaData();
        if (!db[idGrup]) db[idGrup] = { nama: chat.name || 'Grup', tugas: [], jadwal: [] };

        // ============================================================
        // 🔥 PRIORITY ZONE: CEK PERINTAH MANUAL DULUAN 🔥
        // (Wajib ditaruh paling atas biar gak ditimpa AI)
        // ============================================================

        // --- A. FITUR TAG ALL / TOTAG ---
        // Cek kata pertama asli dari pesan user
        const firstWord = pesan.split(' ')[0].toLowerCase(); 
        const tagKeywords = ['tagall', 'totag', 'everyone', 'p'];

        if (tagKeywords.includes(firstWord) || textClean.startsWith('tagall')) {
            if (!chat.isGroup) return msg.reply('❌ Fitur ini khusus di dalam Grup bos!');

            // Ambil isi pesan setelah command
            // Contoh: "tagall besok libur" -> "besok libur"
            let pesanIsi = pesan.slice(firstWord.length).trim();
            
            // Default text kalau kosong
            let finalText = pesanIsi ? 
                `📢 *PENGUMUMAN PENTING!* 📢\n\n"${pesanIsi}"\n\n_cc: All Members_` : 
                "📢 *PANGGILAN KEPADA SELURUH WARGA* 📢";

            // Ambil semua member
            let mentions = [];
            for (let participant of chat.participants) {
                mentions.push(participant.id._serialized);
            }

            try {
                await chat.sendMessage(finalText, { mentions: mentions });
                console.log(`✅ [TAGALL] Sukses di grup "${chat.name}"`);
            } catch (err) {
                console.error(`❌ [TAGALL ERROR]`, err);
                await msg.reply(`❌ Gagal ngetag: ${err.message}`);
            }
            return; // 🛑 BERHENTI DISINI (Biar gak lanjut ke AI)
        }

        // --- B. HAPUS TUGAS MANUAL ---
        if (pesan.startsWith('!hapus')) {
            if (!isAdmin) return msg.reply(replyAI('bukan_admin'));
            if (db[idGrup].tugas.length === 0) return msg.reply("Tidak ada tugas untuk dihapus.");
            const deleted = db[idGrup].tugas.shift(); // Hapus yang paling depan
            simpanData(db);
            return msg.reply(`🗑️ Tugas *${deleted.matkul}* berhasil dihapus.`);
        }
        
        // --- C. HAPUS JADWAL MANUAL ---
        if (pesan.startsWith('!resetjadwal')) {
            if (!isAdmin) return msg.reply(replyAI('bukan_admin'));
            db[idGrup].jadwal = [];
            simpanData(db);
            return msg.reply("🗑️ Seluruh jadwal kuliah berhasil dihapus bersih.");
        }

        // ============================================================
        // 🚀 AI ZONE: BARU PANGGIL AI KALAU BUKAN COMMAND DI ATAS
        // ============================================================
        
        // Cek apakah bot perlu merespon (dipanggil/reply/command)
        const mentions = await msg.getMentions();
        const isMention = mentions.some(contact => contact.number === myNumber);
        
        let isReplyBot = false;
        if (msg.hasQuotedMsg) {
            const quotedMsg = await msg.getQuotedMessage();
            if (quotedMsg.fromMe || (quotedMsg.author && quotedMsg.author.includes(myNumber))) {
                isReplyBot = true;
            }
        }
        
        // Cek kata kunci manual untuk memaksa respon
        const isCommandMode = ['tambah', 'hapus', 'lihat', 'cek', 'jadwal'].some(x => textClean.startsWith(x));
        const isDipanggil = ['asep', 'min', 'p!'].some(x => pesan.toLowerCase().startsWith(x));
        
        const shouldRespond = isDipanggil || isMention || isReplyBot || isCommandMode || pesan.startsWith('!');

        if (chat.isGroup && !shouldRespond) return;

        // Panggil AI
        const result = await processText(textClean);
        
        // 🔥 MANUAL OVERRIDE (PAKSAAN) 🔥
        // Kalau user ketik "tambah tugas ...", JANGAN percayakan 100% ke AI score.
        // Langsung paksa intent-nya jadi 'tugas.tambah'
        if (textClean.startsWith('tambah tugas')) {
            result.intent = 'tugas.tambah';
            result.score = 1.0; 
        } else if (textClean.startsWith('tambah jadwal')) {
            result.intent = 'jadwal.tambah';
            result.score = 1.0;
        }

        // ============================================================
        // 🎯 EKSEKUSI INTENT (HASIL PEMIKIRAN BOT)
        // ============================================================
        const threshold = shouldRespond ? 0 : 0.6; 
        const menuKeywords = ['menu', '!menu', '/menu', '.menu', 'info', 'help', 'tolong'];
        
        // Cek jika kata pertama adalah menu, ATAU isi pesan cuma "menu"
        if (menuKeywords.includes(firstWord) || textClean === 'menu') {
            return msg.reply(
`🤖 *MENU BOT* 🤖

📌 *PERINTAH UTAMA:*
• *Tag Semua*: "tagall pesan", "p pesan"
• *Tugas*: "tambah tugas", "cek tugas"
• *Jadwal*: "tambah jadwal", "cek jadwal"

⚙️ *ADMIN ONLY:*
• "!hapus" (Hapus tugas teratas)
• "!resetjadwal" (Hapus semua jadwal)

_Ketik perintah langsung tanpa tanda kutip._`
            );
        }

        if (result.score > threshold || result.intent.includes('tugas') || result.intent.includes('jadwal') || shouldRespond) {
            
            switch (result.intent) {
                case 'menu.lihat':
                    msg.reply(
`🤖 *MENU BOT* 🤖
1. *Tag All*: "tagall pesan", "p pesan"
2. *Tugas*: "Cek tugas", "Tambah tugas..."
3. *Jadwal*: "Jadwal hari ini", "Tambah jadwal..."
4. *Admin*: "!hapus", "!resetjadwal"`);
                    break;

                case 'tugas.tambah':
                    if (!isAdmin) return msg.reply(replyAI('bukan_admin'));
                    
                    // Deteksi Waktu Deadline
                    const waktuAI = deteksiWaktu(pesan);
                    if (waktuAI) {
                        const toleransi = new Date(); toleransi.setHours(toleransi.getHours() - 1);
                        if (waktuAI < toleransi) return msg.reply(replyAI('gagal_waktu', { tanggal: formatTanggal(waktuAI) }));

                        // Regex Ambil Data
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
                        msg.reply("⚠️ Format tanggal tidak terbaca. Coba: 'Tambah tugas MTK deadline besok jam 10'");
                    }
                    break;

                case 'tugas.lihat':
                    showTugasNatural(msg, db[idGrup].tugas, textClean);
                    break;

                case 'jadwal.tambah':
                    if (!isAdmin) return msg.reply(replyAI('bukan_admin'));

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

                case 'jadwal.lihat':
                    if (db[idGrup].jadwal.length === 0) return msg.reply("📅 Jadwal kosong.");
                    let t = "📅 *JADWAL KULIAH*\n";
                    let currentHari = "";
                    db[idGrup].jadwal.forEach((x) => {
                        if (x.hari.toUpperCase() !== currentHari) {
                            t += `\n🗓️ *${x.hari.toUpperCase()}*\n`; 
                            currentHari = x.hari.toUpperCase();
                        }
                        t += `⏰ ${x.jam} | ${toTitleCase(x.matkul)}\n`;
                    });
                    msg.reply(t);
                    break;

case 'tugas.hapus_pilih':
        if (!isAdmin) return msg.reply(replyAI('bukan_admin'));
        
        // Ambil nomor yang mau dihapus dari entities AI
        // ai.js mengembalikan array string angka, misal: ['1', '2']
        let entityNomor = result.entities.find(e => e.entity === 'nomor_tugas');
        if (!entityNomor || !entityNomor.option) return msg.reply("⚠️ Sebutkan nomor tugas yang mau dihapus. Contoh: 'Hapus tugas 1'");

        let nomorHapus = entityNomor.option.map(n => parseInt(n)); // Ubah ke integer
        let tugasList = db[idGrup].tugas;

        if (tugasList.length === 0) return msg.reply("Zonk! Gak ada tugas yang bisa dihapus.");

        // Kita filter tugas yang INDEKS-nya (+1) TIDAK ada di daftar hapus
        // Kenapa +1? Karena user melihat list mulai dari 1, tapi array mulai dari 0
        let sisaTugas = tugasList.filter((val, index) => !nomorHapus.includes(index + 1));
        
        // Cek apakah ada yang terhapus
        if (sisaTugas.length === tugasList.length) {
            msg.reply("⚠️ Nomor tugas tidak ditemukan/salah.");
        } else {
            let jumlahDihapus = tugasList.length - sisaTugas.length;
            db[idGrup].tugas = sisaTugas; // Update DB
            simpanData(db);
            msg.reply(`✅ Berhasil menghapus ${jumlahDihapus} tugas.`);
        }
        break;
        
    case 'tugas.hapus_confirm':
         if (!isAdmin) return msg.reply(replyAI('bukan_admin'));
         msg.reply("⚠️ Untuk menghapus, sebutkan nomornya. Contoh: *'Hapus tugas 1'* atau *'Hapus tugas 1, 2'*");
         break;
    // ======================================================

    default:
        // Kalau dipanggil tapi AI bingung
        if (result.answer) msg.reply(result.answer);
        else msg.reply("Hadir bos! Ada yang bisa dibantu? Ketik 'Menu' kalau bingung. 🫡");
        break;
}
        }
    } catch (err) {
        console.error("Error di handler:", err);
    }
};