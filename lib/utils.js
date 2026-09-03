// lib/utils.js
process.env.TZ = 'Asia/Jakarta';

// Fungsi balasan acak (tetap sama)
const replyAI = (tipe, data = {}) => {
    const templates = {
        'bukan_admin': [
            "⚠️ Eits, fitur ini khusus Admin ya kak!",
            "🔒 Akses ditolak. Cuma admin yang boleh atur ini.",
            "❌ Maaf, kamu bukan admin grup ini."
        ],
        'sukses_tugas': [
            `✅ Siap! Tugas *${data.matkul}* berhasil disimpan. Deadline: ${data.deadline}.`,
            `👌 Oke, tugas *${data.matkul}* udah masuk list. Semangat ngerjainnya!`,
            `📝 Noted! Jangan lupa kerjain tugas *${data.matkul}* sebelum ${data.deadline} ya.`
        ],
        'gagal_waktu': [
            "⚠️ Format waktu salah atau udah lewat tanggalnya.",
            `❌ Tanggal ${data.tanggal} udah lewat kak, mesin waktu belum ditemukan.`,
            "⚠️ Masukkan tanggal & jam masa depan ya!"
        ],
        'bingung_format': [
            "⚠️ Formatnya kurang pas. Coba: 'Tambah tugas [Matkul] [Waktu]'",
            "🤔 Bingung nih. Pake format: 'Tambah tugas MTK besok jam 9' ya!",
            "❌ Gagal baca data. Pastikan nyebutin nama tugas dan waktunya."
        ]
    };
    const options = templates[tipe];
    return options[Math.floor(Math.random() * options.length)];
};

// Fungsi deteksi waktu yang cerdas dan akurat
const deteksiWaktu = (teks) => {
    if (!teks) return null;
    const cleanTeks = teks.toLowerCase();

    const months = {
        'januari': 0, 'februari': 1, 'maret': 2, 'april': 3, 'mei': 4, 'juni': 5,
        'juli': 6, 'agustus': 7, 'september': 8, 'oktober': 9, 'november': 10, 'desember': 11,
        'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'mei': 4, 'jun': 5,
        'jul': 6, 'agu': 7, 'sep': 8, 'okt': 9, 'nov': 10, 'des': 11
    };

    const days = {
        'minggu': 0, 'ahad': 0, 'senin': 1, 'selasa': 2, 'rabu': 3, 'kamis': 4, 'jumat': 5, "jum'at": 5, 'sabtu': 6
    };

    const now = new Date();
    let target = new Date(now);
    let hasDateMatch = false;

    // 1. Deteksi kata kunci relatif: "besok", "lusa", "hari ini"
    if (cleanTeks.includes('besok')) {
        target.setDate(now.getDate() + 1);
        hasDateMatch = true;
    } else if (cleanTeks.includes('lusa')) {
        target.setDate(now.getDate() + 2);
        hasDateMatch = true;
    } else if (cleanTeks.includes('hari ini')) {
        hasDateMatch = true;
    }

    // 2. Deteksi Hari (misal: "hari senin", "senin depan", "hari jumat")
    const dayMatch = cleanTeks.match(/\b(senin|selasa|rabu|kamis|jumat|jum'at|sabtu|minggu|ahad)\b/i);
    if (dayMatch && !hasDateMatch) {
        const targetDay = days[dayMatch[1].toLowerCase()];
        if (targetDay !== undefined) {
            const currentDay = now.getDay();
            let diff = targetDay - currentDay;
            if (diff <= 0) diff += 7;
            target.setDate(now.getDate() + diff);
            hasDateMatch = true;
        }
    }

    // 3. Deteksi Tanggal Spesifik (misal: "8 september", "tgl 8 september", "deadline 8 september 2026")
    const tglMonthRegex = /(?:(?:tgl|tanggal|deadline|dl|sebelum|pada)\s+)?(\d{1,2})\s+(januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember|jan|feb|mar|apr|mei|jun|jul|agu|sep|okt|nov|des)(?:\s+(\d{4}))?/i;
    const tglMonthMatch = cleanTeks.match(tglMonthRegex);

    if (tglMonthMatch) {
        const day = parseInt(tglMonthMatch[1], 10);
        const month = months[tglMonthMatch[2].toLowerCase()];
        const year = tglMonthMatch[3] ? parseInt(tglMonthMatch[3], 10) : now.getFullYear();
        
        target.setFullYear(year);
        target.setMonth(month);
        target.setDate(day);
        hasDateMatch = true;

        if (!tglMonthMatch[3] && target < now) {
            const diffDays = (now - target) / (1000 * 60 * 60 * 24);
            if (diffDays > 1) {
                target.setFullYear(now.getFullYear() + 1);
            }
        }
    } else {
        const numDateMatch = cleanTeks.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
        if (numDateMatch) {
            const day = parseInt(numDateMatch[1], 10);
            const month = parseInt(numDateMatch[2], 10) - 1;
            let year = numDateMatch[3] ? parseInt(numDateMatch[3], 10) : now.getFullYear();
            if (year < 100) year += 2000;
            target.setFullYear(year);
            target.setMonth(month);
            target.setDate(day);
            hasDateMatch = true;
        }
    }

    // 4. Deteksi Jam (HH:mm, HH.mm, "jam 17.00", "jam 5 sore")
    const jamMatch = cleanTeks.match(/(?:jam|pukul)?\s*(\d{1,2})[:.](\d{2})/i) ||
                     cleanTeks.match(/\b(?:jam|pukul)\s+(\d{1,2})(?:\s+(pagi|siang|sore|malam))?\b/i);

    if (jamMatch) {
        let jam = parseInt(jamMatch[1], 10);
        let menit = jamMatch[2] && !isNaN(parseInt(jamMatch[2], 10)) ? parseInt(jamMatch[2], 10) : 0;
        const ketWaktu = jamMatch[2] && isNaN(parseInt(jamMatch[2], 10)) ? jamMatch[2] : (jamMatch[3] || '');

        if ((ketWaktu === 'sore' || ketWaktu === 'malam') && jam < 12) {
            jam += 12;
        } else if (ketWaktu === 'siang' && jam === 1) {
            jam = 13;
        } else if (ketWaktu === 'pagi' && jam === 12) {
            jam = 0;
        }

        target.setHours(jam, menit, 0, 0);
    } else {
        target.setHours(23, 59, 0, 0);
    }

    return target;
};

// Format tanggal jadi enak dibaca (WIB)
const formatTanggal = (dateObj) => {
    const options = { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' };
    return new Date(dateObj).toLocaleDateString('id-ID', options) + ' WIB';
};

// Ambil data regex
const ambilData = (teks, regex) => {
    const match = teks.match(regex);
    return match ? match[1].trim() : null;
};

const toTitleCase = (str) => {
    return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
};

// ==========================================
// UPDATE: TAMPILAN TUGAS LENGKAP
// ==========================================
const showTugasNatural = (msg, listTugas, query) => {
    if (listTugas.length === 0) {
        return msg.reply("🎉 *Tidak ada tugas!* Selamat bersantai.");
    }

    // Urutkan tugas berdasarkan deadline terdekat
    listTugas.sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

    let response = "📋 *DAFTAR TUGAS KELAS* \n\n";

    listTugas.forEach((t, index) => {
        // Hitung sisa waktu
        const deadlineDate = new Date(t.deadline);
        const now = new Date();
        const diffMs = deadlineDate.getTime() - now.getTime();
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        
        let statusEmoji = "🟢"; // Masih lama
        if (diffDays <= 1) statusEmoji = "🔴"; // H-1 atau hari H
        else if (diffDays <= 3) statusEmoji = "🟡"; // H-3

        const namaMatkul = (t.nama_tugas || t.matkul || 'Tugas').toUpperCase();
        const detailTugas = t.deskripsi || t.detail || '-';
        const pengumpulanTugas = t.pengumpulan || '-';
        const deadlineStr = t.deadline instanceof Date 
            ? t.deadline.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }) + ' WIB' 
            : (t.deadline ? `${t.deadline} WIB` : '-');

        response += `*${index + 1}. ${namaMatkul}* ${statusEmoji}\n`;
        response += `   📝 *Detail:* ${detailTugas}\n`;
        response += `   📂 *Pengumpulan:* ${pengumpulanTugas}\n`;
        response += `   ⏰ *Deadline:* ${deadlineStr}\n`;
        response += `   --------------------\n`;
    });

    response += `\n_Semangat ngerjainnya! Jangan lupa ketik '!hapus' kalau udah kelar._`;
    msg.reply(response);
};

module.exports = { 
    replyAI, 
    deteksiWaktu, 
    formatTanggal, 
    ambilData, 
    toTitleCase, 
    showTugasNatural 
};
