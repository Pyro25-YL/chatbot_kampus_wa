// lib/logic_chat.js
const { trackMenuList, trackTutorialList, buildMenuCategoryListText, buildTutorialCategoryListText } = require('./menu');

const handleChatLogic = async (intent, context) => {
    // Ambil variabel dari context (db diganti pool untuk PostgreSQL)
    const { msg, result, idGrup, text, pool } = context;

    // Bersihkan isi pesan user
    const textClean = (text || msg.body || '').trim();
    const balasanUser = textClean.toLowerCase();

    // ==========================================================
    // 1. LOGIKA RESPON KHUSUS DOSEN (CEK PESAN DULUAN)
    // ==========================================================

    // JIKA DOSEN MENJAWAB HADIR
    if (balasanUser === 'hadir' || balasanUser === 'bisa hadir' || balasanUser === 'masuk') {
        return await msg.reply('Baik Bapak/Ibu, terima kasih atas konfirmasinya. Informasi kehadiran akan saya teruskan ke grup kelas. 🙏✨');
    }

    // JIKA DOSEN MENJAWAB TIDAK HADIR
    if (balasanUser === 'tidak hadir' || balasanUser === 'tidak bisa' || balasanUser === 'absen') {
        let teksGagal = `Baik Bapak/Ibu, terima kasih informasinya. Apakah jadwal kuliah esok hari ingin diganti atau dicarikan waktu alternatif? 🤔\n\n`;
        teksGagal += `Silakan balas:\n`;
        teksGagal += `⌨️ Ketik *Ganti Jadwal* (jika ingin langsung menjadwalkan ulang)\n`;
        teksGagal += `⌨️ Ketik *Minta PJ* (jika ingin menyerahkan penentuan jadwal ke PJ Kelas)`;
        return await msg.reply(teksGagal);
    }

    // JIKA DOSEN MEMILIH OPSI LANJUTAN
    if (balasanUser.includes('ganti jadwal') || balasanUser === 'ganti') {
        return await msg.reply('Silakan tentukan waktu barunya Bapak/Ibu. Contoh format: \n*_Tambah jadwal sementara KP [Matkul] hari [Hari] jam [Jam]_*');
    }

    if (balasanUser.includes('minta pj') || balasanUser.includes('suruh pj')) {
        let teksPJ = `Siap Bapak/Ibu. Saya akan segera menghubungi Penanggung Jawab (PJ) kelas untuk berdiskusi dan menentukan jadwal pengganti yang tepat.`;
        
        try {
            let kId = context.groupSettings?.id;
            if (!kId && idGrup) {
                const resK = await pool.query('SELECT id FROM kelas WHERE group_id_wa = $1 LIMIT 1', [idGrup]);
                kId = resK.rows[0]?.id;
            }
            if (kId) {
                const resPj = await pool.query('SELECT * FROM pj WHERE kelas_id = $1 ORDER BY id ASC', [kId]);
                const daftarPJ = resPj.rows;

                if (daftarPJ.length > 0) {
                    teksPJ += `\n\nList PJ yang dapat dihubungi:\n`;
                    daftarPJ.forEach((p, idx) => {
                        teksPJ += `${idx + 1}. *${p.matkul}* -> @${p.wa}\n`;
                    });
                }
            }
        } catch (err) {
            console.error('Error fetching PJ list:', err.message);
        }
        
        return await msg.reply(teksPJ);
    }

    // ==========================================================
    // 2. SWITCH CASE INTENT (ROUTING INTENT BOT)
    // ==========================================================
    switch (intent) {
        // --- MENU & NAVIGASI ---
        case 'menu.lihat':
            await msg.reply(buildMenuCategoryListText());
            trackMenuList(idGrup);
            break;
        
        case 'tutorial.lihat':
            await msg.reply(buildTutorialCategoryListText());
            trackTutorialList(idGrup);
            break;

        // --- OBROLAN SANTAI ---
        case 'chat.tawa':
        case 'obrolan.bebas':
        case 'chat.ai':
            if (result && result.answer) {
                await msg.reply(result.answer);
            } else {
                await msg.reply("Halo! Ada yang bisa dibantu? 😄");
            }
            break;

        // --- FALLBACK (GAK NGERTI / CHAT BIASE) ---
        default:
            if (result && result.answer) {
                await msg.reply(result.answer);
            } else {
                await msg.reply("Hadir bos! Ada yang bisa dibantu? Ketik 'Menu' kalau bingung. 🫡");
            }
            break;
    }
};

module.exports = { handleChatLogic };