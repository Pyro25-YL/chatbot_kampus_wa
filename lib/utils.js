// lib/utils.js

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

// Fungsi deteksi waktu (tetap sama)
const deteksiWaktu = (teks) => {
    const months = {
        'januari': 0, 'februari': 1, 'maret': 2, 'april': 3, 'mei': 4, 'juni': 5,
        'juli': 6, 'agustus': 7, 'september': 8, 'oktober': 9, 'november': 10, 'desember': 11,
        'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'mei': 4, 'jun': 5,
        'jul': 6, 'agu': 7, 'sep': 8, 'okt': 9, 'nov': 10, 'des': 11
    };

    const now = new Date();
    let target = new Date(now);
    
    // Logika sederhana: "Besok", "Lusa"
    if (teks.includes('besok')) target.setDate(now.getDate() + 1);
    else if (teks.includes('lusa')) target.setDate(now.getDate() + 2);
    
    // Deteksi Jam (HH:mm atau HH.mm)
    const jamMatch = teks.match(/(\d{1,2})[:.](\d{2})/);
    if (jamMatch) {
        target.setHours(parseInt(jamMatch[1]), parseInt(jamMatch[2]), 0);
    } else {
        target.setHours(23, 59, 0); // Default deadline tengah malam
    }

    // Deteksi Tanggal Spesifik (tgl 10, tanggal 10 januari)
    const tglMatch = teks.match(/(?:tgl|tanggal)\s+(\d{1,2})(?:\s+([a-zA-Z]+))?/i);
    if (tglMatch) {
        const tgl = parseInt(tglMatch[1]);
        target.setDate(tgl);
        if (tglMatch[2]) {
            const blnStr = tglMatch[2].toLowerCase();
            if (months[blnStr] !== undefined) target.setMonth(months[blnStr]);
        }
        // Jika tanggal sudah lewat di bulan ini, asumsi bulan depan
        if (target < now && !tglMatch[2]) {
            target.setMonth(target.getMonth() + 1);
        }
    }

    return target;
};

// Format tanggal jadi enak dibaca
const formatTanggal = (dateObj) => {
    const options = { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' };
    return new Date(dateObj).toLocaleDateString('id-ID', options);
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

        const namaMatkul = (t.nama_tugas || t.matkul || t.kode_matkul || 'Tugas').toUpperCase();
        const detailTugas = t.deskripsi || t.detail || '-';
        const formatTugas = t.pengumpulan || t.format || '-';
        const tempatTugas = t.tempat || '-';
        const deadlineStr = t.deadline instanceof Date ? t.deadline.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : (t.deadline || '-');

        response += `*${index + 1}. ${namaMatkul}* ${statusEmoji}\n`;
        response += `   📝 *Detail:* ${detailTugas}\n`;
        if (tempatTugas !== '-') response += `   📍 *Tempat:* ${tempatTugas}\n`;
        response += `   📂 *Format:* ${formatTugas}\n`;
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
