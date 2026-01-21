const MENU_HEADER = 'KATEGORI MENU BOT';
const MENU_NAV = {
    back: 'back',
    exit: 'out'
};
const MENU_NAV_ICON = {
    back: '↩️',
    exit: '🚪'
};
const MENU_STATE = new Map();
const TUTORIAL_HEADER = 'PANDUAN BOT';
const TUTORIAL_STATE = new Map();

const TUTORIAL_CATEGORIES = [
    { key: 'kelas', label: 'kelas (set default kelas per grup, khusus admin)', icon: '🎓' },
    { key: 'jadwal', label: 'jadwal', icon: '📅' },
    { key: 'tugas', label: 'tugas', icon: '📝' },
    { key: 'pj', label: 'pj', icon: '👤' },
    { key: 'dosen', label: 'dosen', icon: '🧑‍🏫' },
    { key: 'ai', label: 'ai', icon: '🤖' }
];

const TUTORIAL_DETAILS = {
    kelas: [
        '🎓 PANDUAN KATEGORI: KELAS',
        'Fungsi: set default kelas di grup agar perintah lain otomatis pakai kelas itu.',
        '- ⚙️ *!setkelas 2025A* (admin, simpan default kelas grup)',
        '  Setelah diset, !jadwal / !tugaslist bisa tanpa isi [kelas].',
        '- 📌 *!kelas* (cek default kelas grup saat ini)',
        '  Contoh: !setkelas 2025B'
    ],
    jadwal: [
        '📅 PANDUAN KATEGORI: JADWAL',
        'Cek jadwal dengan default kelas atau isi manual [kelas].',
        '- 📚 *!jadwal [kelas]* (jadwal lengkap)',
        '- ⏭️ *!jadwalb [kelas]* (jadwal besok)',
        '- 📝 *!jadwalujian [quiz|uts|uas|praktikum|lainnya]*',
        '- 🗓️ *!ringkas [hari|pekan]* (ringkasan jadwal)',
        '- 🔎 *!cari jadwal KATA* (cari matkul/jam/hari)',
        '- 📋 *!listmatkul KELAS* (daftar matkul)',
        'Contoh: !jadwal 2025A'
    ],
    tugas: [
        '📝 PANDUAN KATEGORI: TUGAS',
        'Pantau tugas aktif & deadline, bisa pakai default kelas.',
        '- 📌 *!tugaslist [kelas]* (semua tugas aktif)',
        '- 📅 *!tugasminggu [kelas]* (deadline minggu ini)',
        '- ⏰ *!tugasbesok [kelas]* (deadline besok)',
        '- ⚠️ *!tugaslewat [kelas]* (tugas lewat)',
        '- 🗂️ *!arsiplist [kelas]* (arsip tugas)',
        'Contoh: !tugaslist 2025A'
    ],
    pj: [
        '👤 PANDUAN KATEGORI: PJ',
        'Cek PJ matkul, status kuliah, dan pengingat.',
        '- 👤 *!pj KELAS NAMAPJ* (matkul PJ di kelas tertentu)',
        '- ⏰ *!pjreminder NAMAPJ* (pengingat kuliah besok)',
        '- ✅ *!pjsaya NAMAPJ* (semua matkul yang kamu PJ)',
        '- 📋 *!pjkelas [kelas|semua]* (daftar PJ per kelas)',
        '- 🧾 *!pjall* (semua PJ & matkul)',
        'Contoh: !pj 2025A gustav'
    ],
    dosen: [
        '🧑‍🏫 PANDUAN KATEGORI: DOSEN',
        'Cari dosen & jadwal mengajar (nama bisa sebagian).',
        '- 🧑‍🏫 *!dosenall* (semua dosen & jadwal)',
        '- 📅 *!dosenbesok NAMADOSEN* (jadwal besok)',
        '- 📋 *!dosenkelas [kelas|semua]* (daftar dosen per kelas)',
        'Contoh: !dosenbesok pak harmon'
    ],
    ai: [
        '🤖 PANDUAN KATEGORI: AI',
        'Gunakan untuk tanya AI & cek ketergantungan.',
        '- 💬 *!askai pertanyaan* (tanya jawab umum)',
        '  Contoh: !askai jelaskan integral parsial',
        '- 🧠 *!ckai* (cek ketergantungan AI)',
        '  Alur: bot kirim 4 pertanyaan -> jawab dalam satu pesan.',
        '  Jika diketik di grup, bot lanjut di chat pribadi (DM).',
        '  Setiap user punya sesi sendiri, jadi tidak tercampur.',
        '  Setelah hasil keluar, balas 1/2/3/4 untuk lanjut, 0 untuk akhiri sesi.',
        '- 🧹 *!ai-reset [askai|ckai]* (hapus memori sesi AI)',
        '  Jika tanpa argumen, reset askai & ckai sekaligus.',
        '  Contoh: !ai-reset ckai'
    ]
};

const TUTORIAL_ALLOWED = new Set(['kelas', 'jadwal', 'tugas', 'pj', 'dosen', 'ai']);


const MENU_CATEGORIES = [
    { key: 'kelas', label: 'kelas (set default kelas per grup, khusus admin)', icon: '🎓' },
    { key: 'jadwal', label: 'jadwal', icon: '📅' },
    { key: 'tugas', label: 'tugas', icon: '📝' },
    { key: 'pj', label: 'pj', icon: '👤' },
    { key: 'dosen', label: 'dosen', icon: '🧑‍🏫' },
    { key: 'ai', label: 'ai', icon: '🤖' },
    { key: 'tutorial', label: 'tutorial/panduan', icon: '📖' },
    { key: 'admin', label: 'admin', icon: '🛠️' }
];

const MENU_DETAILS = {
    kelas: [
        '🎓 KATEGORI: KELAS (set default kelas per grup)',
        '- ⚙️ !setkelas 2025A (admin, berlaku di grup ini)',
        '- ℹ️ !kelas (lihat default kelas grup)'
    ],
    jadwal: [
        '📅 KATEGORI: JADWAL',
        '- 🗓️ !jadwal [kelas]',
        '- ⏰ !jadwalb [kelas]',
        '- 🧾 !jadwalujian [quiz|uts|uas|praktikum|lainnya]',
        '- 🧾 !ringkas [hari|pekan]',
        '- 🔎 !cari dosen/jadwal KATA',
        '- 📚 !listmatkul KELAS'
    ],
    tugas: [
        '📝 KATEGORI: TUGAS',
        '- 📅 !tugasminggu [kelas]',
        '- ⏰ !tugasbesok [kelas]',
        '- ⚠️ !tugaslewat [kelas]',
        '- 📋 !tugaslist [kelas]',
        '- 📦 !arsiplist [kelas]'
    ],
    pj: [
        '👤 KATEGORI: PJ',
        '- 👤 !pj KELAS NAMAPJ',
        '- 🔔 !pjreminder NAMAPJ',
        '- 🙋 !pjsaya NAMAPJ',
        '- 🏫 !pjkelas [kelas|semua]',
        '- 👥 !pjall'
    ],
    dosen: [
        '🧑‍🏫 KATEGORI: DOSEN',
        '- 🧑‍🏫 !dosenall',
        '- 📅 !dosenbesok NAMADOSEN',
        '- 🏫 !dosenkelas [kelas|semua]'
    ],
    ai: [
        '🤖 KATEGORI: AI',
        '- 💬 !askai pertanyaan',
        '- 🧠 !ckai (cek ketergantungan AI)',
        '- 🧹 !ai-reset [askai|ckai]'
    ],
    tutorial: [
        '📖 KATEGORI: TUTORIAL/PANDUAN',
        '1) Mulai: ketik !menu lalu pilih kategori.',
        '2) Navigasi: balas pesan bot dengan kategori, gunakan "back" & "out".',
        '3) Set kelas default (admin): !setkelas 2025A',
        '4) Jadwal: !jadwal, !jadwalb, !jadwalujian, !ringkas',
        '5) Tugas: !tugasminggu, !tugasbesok, !tugaslewat, !tugaslist',
        '6) Dosen/PJ: !dosenbesok harmon, !dosenkelas 2025A, !pjkelas 2025A',
        '7) Pencarian: !cari dosen ike | !cari jadwal DASPROM',
        '8) Bantuan: !bantuan (hubungi admin)',
    ],
    admin: [
        '🛠️ KATEGORI: ADMIN (khusus admin)',
        '- ➕ !addmatkul KELAS | NAMA | KODE | DOSEN | HARI(1-7) | JAM | RUANGAN | PJ',
        '- ✏️ !editmatkul KELAS INDEX | NAMA | KODE | DOSEN | HARI | JAM | RUANGAN | PJ',
        '- 🗑️ !delmatkul KELAS INDEX',
        '- 🗓️ !setminggu N',
        '- ➕ !addtugas KELAS | KODE/NAMA | NAMA TUGAS | JENIS | MINGGU/TANGGAL | HARI | PENGUMPULAN | DESKRIPSI',
        '- ✏️ !edittugas KELAS INDEX | KODE/NAMA | NAMA TUGAS | JENIS | MINGGU/TANGGAL | HARI | PENGUMPULAN | DESKRIPSI',
        '- ✅ !donetugas KELAS INDEX',
        '- 🗑️ !hapustugas KELAS INDEX',
        '- 📦 !arsiptugas KELAS INDEX',
        '- ♻️ !arsiprestore KELAS INDEX',
        '- 🔍 !cekdata',
        '- 🔄 !sinkronpj',
        '- 📲 !settelegram NAMADOSEN | @telegram',
        '- 📞 !setpjnomor NAMAPJ | 08xxxxxxxxxx',
        '- ⏳ !setreminder 3d,1d,6h',
        '- 💤 !snooze 1h|2h|3h|off',
        '- 📤 !exportdata [label]',
        '- 📥 !importdata latest|NAMA_FILE.json',
        '- 🧾 !auditlog [jumlah]',
        '- 📣 .hidetag pesan'
    ]
};

const buildMenuCategoryListText = () => {
    const lines = [`🧭 ${MENU_HEADER}`, '', 'Balas pesan ini dengan salah satu kategori:'];
    MENU_CATEGORIES.forEach((item) => lines.push(`- ${item.icon} ${item.label}`));
    lines.push('', 'Butuh bantuan? ketik !bantuan');
    lines.push('Contoh balasan: dosen');
    return lines.join('\n');
};

const buildTutorialCategoryListText = () => {
    const lines = ['📘 ' + TUTORIAL_HEADER, '', 'Silahkan memilih kategori untuk memilih panduan:'];
    TUTORIAL_CATEGORIES.forEach((item) => lines.push(`- ${item.icon} ${item.label}`));
    lines.push('', 'Contoh balasan: pj', '', 'Balas:', '↩️ back (opsi sebelumnya)', '🚪 out (kategori)');
    return lines.join("\n");
};

const buildOnboardingText = (options = {}) => {
    const defaultKelas = options.defaultKelas || null;
    const isAdmin = !!options.isAdmin;
    const lines = ['👋 Halo! Aku bot akademik. Berikut langkah cepat:', ''];

    if (defaultKelas) {
        lines.push(`🎓 Default kelas grup: *${defaultKelas}*`);
    } else if (isAdmin) {
        lines.push('🎓 Set default kelas: *!setkelas 2025A*');
    } else {
        lines.push('🎓 Minta admin set default kelas: *!setkelas 2025A*');
    }

    lines.push(
        '📅 Jadwal: *!jadwal* / *!jadwalb*',
        '📝 Tugas: *!tugaslist*',
        '🧑‍🏫 Dosen: *!dosenbesok harmon*',
        '📖 Panduan lengkap: *!tutorial*',
        '📚 Menu lengkap: *!menu*'
    );
    return lines.join('\n');
};

const buildMenuNavHintText = () =>
    `Balas:\n${MENU_NAV_ICON.back} ${MENU_NAV.back} (opsi sebelumnya)\n${MENU_NAV_ICON.exit} ${MENU_NAV.exit} (kategori)`;

const buildTutorialNavHintText = () =>
    `Balas:\n↩️ ${MENU_NAV.back} (panduan)\n🚪 ${MENU_NAV.exit} (menu)`;

const buildMenuCategoryDetailText = (categoryKey, isAdmin) => {
    const key = categoryKey && MENU_DETAILS[categoryKey] ? categoryKey : null;
    if (!key) {
        return buildMenuCategoryListText();
    }

    const lines = [...MENU_DETAILS[key]];
    if (key === 'admin' && !isAdmin) {
        lines.push('', 'Catatan: perintah admin hanya bisa dipakai admin grup.');
    }
    lines.push('', buildMenuNavHintText());
    return lines.join('\n');
};

const buildTutorialCategoryDetailText = (categoryKey) => {
    const key = categoryKey && TUTORIAL_DETAILS[categoryKey] ? categoryKey : null;
    if (!key) return buildTutorialCategoryListText();
    const lines = [...TUTORIAL_DETAILS[key]];
    lines.push('', buildTutorialNavHintText());
    return lines.join("\n");
};

const normalizeMenuCategory = (input) => {
    const raw = (input || '').toLowerCase();
    if (!raw) return null;
    const cleaned = raw.replace(/[^\w\s]/g, ' ').trim();
    if (!cleaned) return null;
    const tokens = cleaned.split(/\s+/);

    if (cleaned.includes('kelas') || tokens.includes('setkelas') || cleaned.includes('default kelas')) {
        return 'kelas';
    }
    if (tokens.some((t) => t.startsWith('jadwal'))) return 'jadwal';
    if (tokens.some((t) => t.startsWith('tugas'))) return 'tugas';
    if (tokens.some((t) => t.startsWith('pj'))) return 'pj';
    if (tokens.some((t) => t.startsWith('dosen'))) return 'dosen';
    if (tokens.includes('ai')) return 'ai';
    if (tokens.includes('tutorial') || tokens.includes('panduan') || tokens.includes('guide')) {
        return 'tutorial';
    }
    if (tokens.includes('admin')) return 'admin';
    return null;
};

const normalizeTutorialCategory = (input) => {
    const key = normalizeMenuCategory(input);
    if (!key) return null;
    return TUTORIAL_ALLOWED.has(key) ? key : null;
};

const normalizeMenuNavigation = (input) => {
    const raw = (input || '').toLowerCase();
    if (!raw) return null;
    const cleaned = raw.replace(/[^\w\s]/g, ' ').trim();
    if (!cleaned) return null;
    const tokens = cleaned.split(/\s+/);
    if (tokens.includes(MENU_NAV.exit) || tokens.includes('keluar') || tokens.includes('exit')) return 'exit';
    if (tokens.includes(MENU_NAV.back) || tokens.includes('kembali') || tokens.includes('back')) return 'back';
    return null;
};

const isMenuCategoryListText = (text) => {
    const body = (text || '').toLowerCase();
    return body.includes(MENU_HEADER.toLowerCase());
};

const isMenuCategoryDetailText = (text) => {
    const body = (text || '').toLowerCase();
    return body.includes('kategori:');
};

const isTutorialCategoryListText = (text) => {
    const body = (text || '').toLowerCase();
    return body.includes(TUTORIAL_HEADER.toLowerCase());
};

const isTutorialCategoryDetailText = (text) => {
    const body = (text || '').toLowerCase();
    return body.includes('panduan kategori:');
};

const getMenuState = (chatId) => {
    if (!chatId) return { stack: [] };
    return MENU_STATE.get(chatId) || { stack: [] };
};

const setMenuState = (chatId, state) => {
    if (!chatId) return;
    MENU_STATE.set(chatId, state);
};

const trackMenuList = (chatId) => {
    setMenuState(chatId, { stack: [{ type: 'list' }] });
};

const trackMenuDetail = (chatId, category) => {
    if (!chatId || !category) return;
    setMenuState(chatId, { stack: [{ type: 'list' }, { type: 'detail', category }] });
};

const trackMenuResult = (chatId, category) => {
    if (!chatId || !category) return;
    setMenuState(chatId, {
        stack: [
            { type: 'list' },
            { type: 'detail', category },
            { type: 'result', category }
        ]
    });
};

const getTutorialState = (chatId) => {
    if (!chatId) return { stack: [] };
    return TUTORIAL_STATE.get(chatId) || { stack: [] };
};

const setTutorialState = (chatId, state) => {
    if (!chatId) return;
    TUTORIAL_STATE.set(chatId, state);
};

const clearTutorialState = (chatId) => {
    if (!chatId) return;
    TUTORIAL_STATE.delete(chatId);
};

const trackTutorialList = (chatId) => {
    setTutorialState(chatId, { stack: [{ type: 'list' }] });
};

const trackTutorialDetail = (chatId, category) => {
    if (!chatId || !category) return;
    setTutorialState(chatId, { stack: [{ type: 'list' }, { type: 'detail', category }] });
};

const goBackTutorialView = (chatId) => {
    const state = getTutorialState(chatId);
    if (state.stack.length > 1) state.stack.pop();
    if (!state.stack.length) state.stack.push({ type: 'list' });
    setTutorialState(chatId, state);
    return state.stack[state.stack.length - 1];
};

const hasTutorialState = (chatId) => {
    if (!chatId) return false;
    const state = TUTORIAL_STATE.get(chatId);
    return !!(state && state.stack && state.stack.length);
};

const goBackMenuView = (chatId) => {
    const state = getMenuState(chatId);
    if (state.stack.length > 1) state.stack.pop();
    if (!state.stack.length) state.stack.push({ type: 'list' });
    setMenuState(chatId, state);
    return state.stack[state.stack.length - 1];
};

const hasMenuState = (chatId) => {
    if (!chatId) return false;
    const state = MENU_STATE.get(chatId);
    return !!(state && state.stack && state.stack.length);
};

module.exports = {
    buildMenuCategoryListText,
    buildMenuCategoryDetailText,
    buildMenuNavHintText,
    buildTutorialCategoryListText,
    buildTutorialCategoryDetailText,
    buildTutorialNavHintText,
    buildOnboardingText,
    normalizeMenuCategory,
    normalizeTutorialCategory,
    normalizeMenuNavigation,
    isMenuCategoryListText,
    isMenuCategoryDetailText,
    isTutorialCategoryListText,
    isTutorialCategoryDetailText,
    trackMenuList,
    trackMenuDetail,
    trackMenuResult,
    trackTutorialList,
    trackTutorialDetail,
    clearTutorialState,
    getTutorialState,
    goBackTutorialView,
    hasTutorialState,
    goBackMenuView,
    hasMenuState
};
