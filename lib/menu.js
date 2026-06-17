const MENU_HEADER = 'KATEGORI MENU UTAMA BOT';
const MENU_NAV = {
    back: 'back',
    exit: 'out'
};
const MENU_NAV_ICON = {
    back: '↩️',
    exit: '🚪'
};
const MENU_STATE = new Map();
const TUTORIAL_HEADER = 'PANDUAN PENGGUNAAN BOT';
const TUTORIAL_STATE = new Map();

// --- KONFIGURASI KATEGORI ---
const TUTORIAL_CATEGORIES = [
    { key: 'jadwal', label: 'Jadwal Kuliah & Ujian', icon: '📅' },
    { key: 'jadwalsementara', label: 'Jadwal Sementara / Pengganti', icon: '⏳' },
    { key: 'tugas', label: 'Manajemen Tugas & PR', icon: '📝' },
    { key: 'pj', label: 'Penanggung Jawab (PJ) Matkul', icon: '👤' },
    { key: 'dosen', label: 'Informasi & Jadwal Dosen', icon: '🧑‍🏫' }
];

const MENU_CATEGORIES = [
    ...TUTORIAL_CATEGORIES,
    { key: 'admin', label: 'Panel Perintah Manajemen Admin', icon: '🛠️' }
];

// --- DETAIL KONTEN PANDUAN (TUTORIAL) ---
const TUTORIAL_DETAILS = {
    jadwal: [
        '📅 *PANDUAN KATEGORI: JADWAL*',
        '━━━━━━━━━━━━━━━━━━━━━━━━',
        'Membantu kamu memantau jadwal kuliah harian, mingguan, hingga agenda ujian.',
        '',
        '📚 *PERINTAH UTAMA:*',
        '• *!jadwal [kelas]* ➜ Cek jadwal kuliah lengkap.',
        '• *!jadwalb [kelas]* ➜ Cek jadwal kuliah besok hari.',
        '• *!jadwalujian [quiz|uts|uas|praktikum|lainnya]* ➜ Cek agenda ujian khusus.',
        '• *!ringkas [hari|pekan]* ➜ Ringkasan jadwal dalam teks padat.',
        '• *!cari jadwal [KataKunci]* ➜ Cari matkul, jam, atau hari tertentu.',
        '• *!listmatkul [kelas]* ➜ Daftar semua mata kuliah terdaftar.',
        '',
        '💡 _Tips: Jika ingin melihat jadwal kompensasi/pengganti, silakan cek kategori `jadwalsementara`._'
    ],
    jadwalsementara: [
        '⏳ *PANDUAN KATEGORI: JADWAL SEMENTARA*',
        '━━━━━━━━━━━━━━━━━━━━━━━━',
        'Digunakan untuk melihat atau melacak kelas pengganti (make-up class), perubahan jam kuliah, maupun pembatalan jadwal yang hanya berlaku pada minggu berjalan.',
        '',
        '⚙️ *PERINTAH UTAMA:*',
        '• *!jadwalsementara [kelas]*',
        '  _Tampilkan semua info perubahan jadwal aktif minggu ini._',
        '  Contoh: `!jadwalsementara 2025A`',
        '',
        '💡 _Catatan Admin:_ Perubahan jadwal ini otomatis di-reset oleh sistem setiap pergantian minggu perkuliahan.'
    ],
    tugas: [
        '📝 *PANDUAN KATEGORI: TUGAS*',
        '━━━━━━━━━━━━━━━━━━━━━━━━',
        'Pantau semua tugas aktif, tenggat waktu (deadline), hingga riwayat arsip.',
        '',
        '📌 *PERINTAH UTAMA:*',
        '• *!tugaslist [kelas]* ➜ Tampilkan seluruh tugas aktif saat ini.',
        '• *!tugasminggu [kelas]* ➜ Daftar tugas yang deadline-nya minggu ini.',
        '• *!tugasbesok [kelas]* ➜ Daftar tugas kritis yang deadline-nya besok.',
        '• *!tugaslewat [kelas]* ➜ Tampilkan tugas yang sudah melewati deadline.',
        '• *!arsiplist [kelas]* ➜ Lihat data tugas lama yang sudah diarsip.',
        '',
        ' Contoh penggunaan: `!tugaslist 2025A`'
    ],
    pj: [
        '👤 *PANDUAN KATEGORI: PENANGGUNG JAWAB (PJ)*',
        '━━━━━━━━━━━━━━━━━━━━━━━━',
        'Informasi kontak dan manajemen penanggung jawab tiap mata kuliah.',
        '',
        '👥 *PERINTAH UTAMA:*',
        '• *!pj [kelas] [nama_pj]* ➜ Cari info matkul yang dipegang oleh PJ tertentu.',
        '• *!pjreminder [nama_pj]* ➜ Set pengingat kuliah besok untuk PJ.',
        '• *!pjsaya [nama_pj]* ➜ Tampilkan seluruh daftar matkul milik kamu.',
        '• *!pjkelas [kelas|semua]* ➜ Daftar pembagian PJ di dalam kelas.',
        '• *!pjall* ➜ Tampilkan rangkuman seluruh data PJ dan matkul.',
        '',
        ' Contoh penggunaan: `!pj 2025A gustav`'
    ],
    dosen: [
        '🧑‍🏫 *PANDUAN KATEGORI: DOSEN*',
        '━━━━━━━━━━━━━━━━━━━━━━━━',
        'Cari data dosen, kontak, beserta jadwal mengajar secara instan.',
        '',
        '📋 *PERINTAH UTAMA:*',
        '• *!dosenall* ➜ Tampilkan seluruh database dosen beserta jadwalnya.',
        '• *!dosenbesok [NamaDosen]* ➜ Cek jadwal mengajar dosen tertentu besok.',
        '• *!dosenkelas [kelas|semua]* ➜ Daftar dosen pengajar di kelas kamu.',
        '',
        '💡 _Pencarian nama dosen bersifat fleksibel (bisa mengetik sebagian nama saja)._',
        ' Contoh: `!dosenbesok pak harmon`'
    ]
};

// --- DETAIL KONTEN MENU ---
const MENU_DETAILS = {
    jadwal: [
        '📅 *KATEGORI: JADWAL KULIAH*',
        '━━━━━━━━━━━━━━━━━━━━━━━━',
        '• `!jadwal [kelas]` ➜ Jadwal kuliah lengkap.',
        '• `!jadwalb [kelas]` ➜ Jadwal kuliah besok hari.',
        '• `!jadwalujian [jenis]` ➜ Ujian (quiz/uts/uas/praktikum).',
        '• `!ringkas [hari|pekan]` ➜ Ringkasan format teks padat.',
        '• `!cari jadwal [kata]` ➜ Cari matkul/hari/jam.',
        '• `!listmatkul [kelas]` ➜ Daftar nama mata kuliah.'
    ],
    jadwalsementara: [
        '⏳ *KATEGORI: JADWAL SEMENTARA*',
        '━━━━━━━━━━━━━━━━━━━━━━━━',
        '• `!jadwalsementara [kelas]` ➜ Tampilkan semua kelas pengganti/perubahan jadwal khusus minggu ini.'
    ],
    tugas: [
        '📝 *KATEGORI: MANAJEMEN TUGAS*',
        '━━━━━━━━━━━━━━━━━━━━━━━━',
        '• `!tugaslist [kelas]` ➜ Tampilkan seluruh tugas aktif.',
        '• `!tugasminggu [kelas]` ➜ Deadline minggu ini.',
        '• `!tugasbesok [kelas]` ➜ Deadline besok hari.',
        '• `!tugaslewat [kelas]` ➜ Tugas yang melewati tenggat.',
        '• `!arsiplist [kelas]` ➜ Lihat arsip tugas lama.'
    ],
    pj: [
        '👤 *KATEGORI: DATA PENANGGUNG JAWAB*',
        '━━━━━━━━━━━━━━━━━━━━━━━━',
        '• `!pj [kelas] [nama_pj]` ➜ Cek matkul yang dipegang PJ.',
        '• `!pjreminder [nama]` ➜ Pengingat jadwal kelas besok.',
        '• `!pjsaya [nama]` ➜ List seluruh matkul yang kamu pegang.',
        '• `!pjkelas [kelas]` ➜ Pembagian data PJ per kelas.',
        '• `!pjall` ➜ Rekap massal data PJ & matkul.'
    ],
    dosen: [
        '🧑‍🏫 *KATEGORI: DATA DOSEN*',
        '━━━━━━━━━━━━━━━━━━━━━━━━',
        '• `!dosenall` ➜ Database seluruh dosen & mengajar.',
        '• `!dosenbesok [nama]` ➜ Cek jadwal mengajar dosen besok.',
        '• `!dosenkelas [kelas]` ➜ Daftar dosen pengajar kelas.'
    ],
    admin: [
        '🛠️ *PANEL KENDALI ADMIN (KHUSUS MANAJEMEN)*',
        '━━━━━━━━━━━━━━━━━━━━━━━━',
        '⚙️ *MANAJEMEN MATA KULIAH:*',
        '• `!addmatkul KELAS | NAMA | KODE | DOSEN | HARI(1-7) | JAM | RUANGAN | PJ`',
        '• `!editmatkul KELAS INDEX | NAMA | KODE | DOSEN | HARI | JAM | RUANGAN | PJ`',
        '• `!delmatkul KELAS INDEX`',
        '• `!listmatkul KELAS`',
        '• `!resetjadwal` ➜ Hapus seluruh jadwal grup saat ini.',
        '',
        '⚙️ *MANAJEMEN TUGAS:*',
        '• `!addtugas KELAS | KODE/NAMA | NAMA TUGAS | JENIS | MINGGU/TANGGAL | HARI | PENGUMPULAN | DESKRIPSI`',
        '• `!edittugas KELAS INDEX | KODE/NAMA | NAMA TUGAS | JENIS | MINGGU/TANGGAL | HARI | PENGUMPULAN | DESKRIPSI`',
        '• `!donetugas KELAS INDEX` ➜ Tandai selesai.',
        '• `!hapustugas KELAS INDEX` ➜ Hapus dari sistem.',
        '• `!arsiptugas KELAS INDEX` ➜ Masukkan ke arsip.',
        '• `!arsiprestore KELAS INDEX` ➜ Kembalikan dari arsip.',
        '',
        '⚙️ *PENGATURAN & KONFIGURASI SISTEM:*',
        '• `!setminggu N` ➜ Atur perkuliahan minggu ke-N.',
        '• `!settelegram NAMADOSEN | @telegram`',
        '• `!setpjnomor NAMAPJ | 08xxxxxxxxxx`',
        '• `!setreminder 3d,1d,6h` ➜ Atur rentang alarm bot.',
        '• `!snooze 1h|2h|3h|off` ➜ Senyapkan sementara.',
        '• `!sinkronpj` ➜ Sinkronisasi data PJ.',
        '• `!cekdata` ➜ Validasi struktur data lokal.',
        '',
        '⚙️ *BACKUP & UTILITAS GRUP:*',
        '• `!exportdata [label]` ➜ Unduh cadangan database.',
        '• `!importdata latest|NAMA_FILE.json` ➜ Pemulihan data.',
        '• `!auditlog [jumlah]` ➜ Periksa riwayat log perubahan.',
        '• `!broadcast [pesan]` ➜ Kirim pesan masal ke DM semua member.',
        '• `.hidetag [pesan]` ➜ Tag seluruh anggota secara senyap.'
    ]
};

const TUTORIAL_ALLOWED = new Set(['jadwal', 'jadwalsementara', 'tugas', 'pj', 'dosen']);

// --- FUNGSI BUILDER TEKS UI ---
const buildMenuCategoryListText = () => {
    const lines = [
        `🧭 *${MENU_HEADER}*`,
        '━━━━━━━━━━━━━━━━━━━━━━━━',
        'Silakan *balas (reply)* pesan ini menggunakan salah satu nama kategori di bawah untuk melihat daftar perintah:',
        ''
    ];
    MENU_CATEGORIES.forEach((item) => lines.push(`${item.icon} *${item.key}* ➜ ${item.label}`));
    lines.push('', '━━━━━━━━━━━━━━━━━━━━━━━━', '📌 _Ada kendala? Ketik *!bantuan* atau *admin*._', '✍️ Contoh Balasan: *jadwalsementara*');
    return lines.join('\n');
};

const buildTutorialCategoryListText = () => {
    const lines = [
        `📘 *${TUTORIAL_HEADER}*`,
        '━━━━━━━━━━━━━━━━━━━━━━━━',
        'Pilih salah satu kategori untuk membaca panduan cara kerja fitur:',
        ''
    ];
    TUTORIAL_CATEGORIES.forEach((item) => lines.push(`${item.icon} *${item.key}* ➜ ${item.label}`));
    lines.push(
        '', 
        '━━━━━━━━━━━━━━━━━━━━━━━━', 
        '✍️ Contoh Balasan: *jadwal*', 
        '', 
        '💡 *Opsi Navigasi Cepat:*',
        '• *back* ➜ Kembali ke menu sebelumnya',
        '• *out* ➜ Keluar dari panduan'
    );
    return lines.join("\n");
};

const buildOnboardingText = (options = {}) => {
    const defaultKelas = options.defaultKelas || null;
    const lines = ['👋 *Halo! Aku Bot Academic Terintegrasi.*', 'Berikut beberapa langkah cepat untuk memulai:', '━━━━━━━━━━━━━━━━━━━━━━━━'];

    if (defaultKelas) {
        lines.push(`🎓 Default Kelas Grup: *${defaultKelas}*`);
    }

    lines.push(
        '',
        '📅 *Akses Jadwal:* Ketik `!jadwal` atau `!jadwalb` (esok hari).',
        '⏳ *Jadwal Sementara:* Ketik `!jadwalsementara` untuk cek info kelas pengganti.',
        '📝 *Akses Tugas:* Ketik `!tugaslist` untuk memantau deadline.',
        '🧑‍🏫 *Cari Dosen:* Contoh ketik `!dosenbesok harmon`.',
        '',
        '━━━━━━━━━━━━━━━━━━━━━━━━',
        '📚 Untuk daftar perintah lengkap ketik: *!menu*'
    );
    return lines.join('\n');
};

const buildMenuNavHintText = () =>
    `━━━━━━━━━━━━━━━━━━━━━━━━\n*Navigasi Konten:*\n${MENU_NAV_ICON.back} Balas *${MENU_NAV.back}* (Menu utama)\n${MENU_NAV_ICON.exit} Balas *${MENU_NAV.exit}* (Keluar menu)`;

const buildTutorialNavHintText = () =>
    `━━━━━━━━━━━━━━━━━━━━━━━━\n*Navigasi Konten:*\n↩️ Balas *${MENU_NAV.back}* (Daftar panduan)\n🚪 Balas *${MENU_NAV.exit}* (Kategori utama)`;

const buildMenuCategoryDetailText = (categoryKey, isAdmin) => {
    const key = categoryKey && MENU_DETAILS[categoryKey] ? categoryKey : null;
    if (!key) {
        return buildMenuCategoryListText();
    }

    const lines = [...MENU_DETAILS[key]];
    if (key === 'admin' && !isAdmin) {
        lines.push('', '⚠️ _Catatan: Perintah di kategori ini dilindungi sistem, hanya bisa dijalankan oleh Admin Grup!_');
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

// --- FUNGSI NORMALISASI DATA INPUT ---
const normalizeMenuCategory = (input) => {
    const raw = (input || '').toLowerCase();
    if (!raw) return null;
    const cleaned = raw.replace(/[^\w\s]/g, ' ').trim();
    if (!cleaned) return null;
    const tokens = cleaned.split(/\s+/);

    if (cleaned.includes('sementara') || tokens.some((t) => t.includes('jadwalsementara'))) {
        return 'jadwalsementara';
    }
    if (tokens.some((t) => t.startsWith('jadwal'))) return 'jadwal';
    if (tokens.some((t) => t.startsWith('tugas'))) return 'tugas';
    if (tokens.some((t) => t.startsWith('pj'))) return 'pj';
    if (tokens.some((t) => t.startsWith('dosen'))) return 'dosen';
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

// --- LOGIKA STATUS (STATE CHECKER) ---
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

// --- GETTER & SETTER STATUS ---
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