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
    { key: 'absensi', label: 'Rekapitulasi Absensi RFID', icon: '📊' },
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
        '📅 *PANDUAN LENGKAP: JADWAL KULIAH*',
        '━━━━━━━━━━━━━━━━━━━━━━━━',
        '📖 *1. LIHAT (READ):*',
        '• `jadwal` ➜ Daftar seluruh jadwal kelas aktif.',
        '• `jadwal besok` ➜ Jadwal perkuliahan besok hari.',
        '• `jadwal [hari]` ➜ Jadwal hari tertentu (cth: `jadwal senin`).',
        '• `cari jadwal [kata]` ➜ Cari matkul/ruang/jam.',
        '',
        '➕ *2. TAMBAH (CREATE):*',
        '• Format: `tambah jadwal matkul [Nama], dosen [Dosen], hari [Hari], jam mulai [Jam] jam selesai [Jam], ruangan [Ruang]`',
        '• Contoh: `tambah jadwal matkul Pemrograman Web, dosen Pak Budi, hari Senin, jam mulai 08.00 jam selesai 10.30, ruangan R.B402`',
        '• Opsi tambahan: `toleransi 10 menit`',
        '',
        '✏️ *3. EDIT (UPDATE):*',
        '• Format: `edit jadwal [Nomor] jam [Jam] hari [Hari] ruangan [Ruang]`',
        '• Contoh: `edit jadwal 2 jam 13.00 ruangan Lab Komputer 1`',
        '',
        '🗑️ *4. HAPUS (DELETE):*',
        '• Format: `hapus jadwal [Nomor]`',
        '• Contoh: `hapus jadwal 3`'
    ],
    jadwalsementara: [
        '⏳ *PANDUAN LENGKAP: JADWAL SEMENTARA / KELAS PENGGANTI*',
        '━━━━━━━━━━━━━━━━━━━━━━━━',
        '📖 *1. LIHAT (READ):*',
        '• `jadwal sementara` ➜ Tampilkan jadwal pengganti/khusus minggu ini.',
        '',
        '➕ *2. TAMBAH (CREATE):*',
        '• Format: `tambah jadwal sementara matkul [Nama], tanggal asli [Tgl], tanggal baru [Tgl], jam mulai [Jam] jam selesai [Jam], ruangan [Ruang]`',
        '• Contoh: `tambah jadwal sementara matkul Kecerdasan Buatan, tanggal asli 18 September 2026, tanggal baru 20 September 2026, jam mulai 09.00 jam selesai 11.00, ruangan Lab AI`',
        '',
        '✏️ *3. EDIT (UPDATE):*',
        '• Format: `edit jadwal sementara [Nomor] jam [Jam Baru] ruangan [Ruang Baru]`',
        '• Contoh: `edit jadwal sementara 1 jam 10.00 ruangan R.302`',
        '',
        '🗑️ *4. HAPUS (DELETE):*',
        '• Format: `hapus jadwal sementara [Nomor]`',
        '• Contoh: `hapus jadwal sementara 1`'
    ],
    absensi: [
        '📊 *PANDUAN LENGKAP: REKAPITULASI ABSENSI & RFID*',
        '━━━━━━━━━━━━━━━━━━━━━━━━',
        '• `absensi` ➜ Rekap ringkasan kehadiran pertemuan terakhir.',
        '• `absensi [matkul]` ➜ Rekap kehadiran untuk matkul tertentu.',
        '• `download absensi` / `rekap excel` ➜ Bot otomatis men-generate & mengirimkan berkas *Excel (.xlsx)* resmi rekapitulasi presensi RFID.',
        '• `set kelas [Nama Kelas]` ➜ Hubungkan grup WA ke kelas database (cth: `set kelas 2026A`).',
        '• `unset kelas` ➜ Lepaskan keterhubungan kelas dari grup ini.'
    ],
    tugas: [
        '📝 *PANDUAN LENGKAP: MANAJEMEN TUGAS KULIAH*',
        '━━━━━━━━━━━━━━━━━━━━━━━━',
        '📖 *1. LIHAT (READ):*',
        '• `tugas` ➜ Tampilkan seluruh tugas aktif.',
        '• `tugas besok` ➜ Tugas deadline besok hari.',
        '• `tugas minggu ini` ➜ Tugas deadline minggu ini.',
        '',
        '➕ *2. TAMBAH (CREATE):*',
        '• Format: `tambah tugas matkul [Nama], detail [Isi], kumpul di [Tempat], deadline [Tgl & Jam]`',
        '• Contoh: `tambah tugas matkul Basis Data, detail Resume Bab 3 Normalisasi, kumpul di LMS, deadline besok jam 23.59`',
        '',
        '✏️ *3. EDIT (UPDATE):*',
        '• Format: `edit tugas [Nomor], detail [Isi Baru] kumpul di [Tempat Baru]`',
        '• Contoh: `edit tugas 1 detail Resume Bab 3 & 4 kumpul di Classroom`',
        '',
        '🎉 *4. TANDAI SELESAI (DONE):*',
        '• Format: `tugas [Nomor] selesai` atau `selesai tugas [Nomor]`',
        '• Contoh: `tugas 1 selesai`',
        '',
        '🗑️ *5. HAPUS (DELETE):*',
        '• Format: `hapus tugas [Nomor]`',
        '• Contoh: `hapus tugas 1` atau `hapus tugas 1, 2`'
    ],
    pj: [
        '👤 *PANDUAN LENGKAP: PENANGGUNG JAWAB (PJ) MATKUL*',
        '━━━━━━━━━━━━━━━━━━━━━━━━',
        '📖 *1. LIHAT (READ):*',
        '• `list pj` atau `pj kelas` ➜ Daftar seluruh PJ matkul di kelas ini.',
        '• `pj [nama]` ➜ Cari matkul yang dipegang PJ tertentu.',
        '',
        '➕ *2. TAMBAH (CREATE):*',
        '• Format: `tambah pj [Nama] matkul [Nama Matkul] wa [Nomor WA]`',
        '• Contoh: `tambah pj Rian matkul Machine Learning wa 081234567890`',
        '• _Catatan: Nomor WA yang didaftarkan otomatis mendapat hak akses admin untuk tugas & jadwal kelas._',
        '',
        '✏️ *3. EDIT (UPDATE):*',
        '• Format: `edit pj [Nomor], nama [Nama Baru] wa [Nomor Baru]`',
        '• Contoh: `edit pj 1 wa 089876543210`',
        '',
        '🗑️ *4. HAPUS (DELETE):*',
        '• Format: `hapus pj [Nomor]`',
        '• Contoh: `hapus pj 2`'
    ],
    dosen: [
        '🧑‍🏫 *PANDUAN LENGKAP: DATABASE DOSEN PENGAMPU*',
        '━━━━━━━━━━━━━━━━━━━━━━━━',
        '📖 *1. LIHAT (READ):*',
        '• `dosen` atau `list dosen` ➜ Daftar seluruh dosen pengampu & nomor WA.',
        '• `dosen [nama]` ➜ Cari info dosen tertentu.',
        '',
        '➕ *2. TAMBAH (CREATE):*',
        '• Format: `tambah dosen [Nama Dosen], wa [Nomor WA]`',
        '• Contoh: `tambah dosen Prof. Siti Aminah, wa 081122334455`',
        '',
        '✏️ *3. EDIT (UPDATE):*',
        '• Format: `edit dosen [Nomor] wa [Nomor Baru]` atau `nama [Nama Baru]`',
        '• Contoh: `edit dosen 1 wa 081299887766`',
        '',
        '🗑️ *4. HAPUS (DELETE):*',
        '• Format: `hapus dosen [Nomor]`',
        '• Contoh: `hapus dosen 1`'
    ]
};

// --- DETAIL KONTEN MENU ---
const MENU_DETAILS = {
    jadwal: TUTORIAL_DETAILS.jadwal,
    jadwalsementara: TUTORIAL_DETAILS.jadwalsementara,
    absensi: TUTORIAL_DETAILS.absensi,
    tugas: TUTORIAL_DETAILS.tugas,
    pj: TUTORIAL_DETAILS.pj,
    dosen: TUTORIAL_DETAILS.dosen,
    admin: [
        '🛠️ *PANEL KENDALI ADMIN & PANDUAN CRUD*',
        '━━━━━━━━━━━━━━━━━━━━━━━━',
        '⚙️ *SETUP KELAS GRUP:*',
        '• `set kelas [Nama Kelas]` ➜ Hubungkan grup WA ke database kelas (cth: `set kelas 2026A`).',
        '• `unset kelas` ➜ Lepaskan kelas dari grup ini.',
        '',
        '⚙️ *PILIH KATEGORI CRUD UNTUK FORMAT LENGKAP:*',
        '• Balas *jadwal* ➜ Panduan CRUD Jadwal Kuliah.',
        '• Balas *tugas* ➜ Panduan CRUD Tugas Kuliah.',
        '• Balas *pj* ➜ Panduan CRUD Penanggung Jawab Matkul.',
        '• Balas *jadwalsementara* ➜ Panduan CRUD Jadwal Pengganti.',
        '• Balas *dosen* ➜ Panduan CRUD Data Dosen.',
        '• Balas *absensi* ➜ Unduh Excel & Rekap Presensi RFID.',
        '',
        '⚙️ *UTILITAS TAMBAHAN:*',
        '• `!broadcast [pesan]` ➜ Kirim pesan ke semua member.',
        '• `.hidetag [pesan]` ➜ Tag seluruh anggota secara senyap.'
    ]
};

const TUTORIAL_ALLOWED = new Set(['jadwal', 'jadwalsementara', 'tugas', 'pj', 'dosen']);

// --- FUNGSI BUILDER TEKS UI ---
const buildFullCrudMenuText = () => {
    return [
        '📖 *PANDUAN FORMAT PERINTAH CRUD BOT* 🤖',
        '━━━━━━━━━━━━━━━━━━━━━━━━',
        '',
        '📝 *1. TUGAS KULIAH*',
        '• *Tambah:* `tambah tugas matkul [Nama], detail [Isi], kumpul di [Tempat], deadline [Waktu]`',
        '  _Contoh:_ `tambah tugas matkul Basis Data, detail Resume Bab 3, kumpul di LMS, deadline besok jam 23.59`',
        '• *Lihat:* `tugas` | `tugas besok` | `tugas minggu ini`',
        '• *Edit:* `edit tugas [No], detail [Isi Baru] kumpul di [Tempat Baru]`',
        '• *Selesai:* `tugas [No] selesai` atau `selesai tugas [No]`',
        '• *Hapus:* `hapus tugas [No]`',
        '',
        '📅 *2. JADWAL KULIAH REGULER*',
        '• *Tambah:* `tambah jadwal matkul [Nama], dosen [Dosen], hari [Hari], jam mulai [Jam] jam selesai [Jam], ruangan [Ruang]`',
        '  _Contoh:_ `tambah jadwal matkul Pemrograman Web, dosen Pak Budi, hari Senin, jam mulai 08.00 jam selesai 10.30, ruangan R.B402`',
        '• *Lihat:* `jadwal` | `jadwal besok` | `jadwal [hari]`',
        '• *Edit:* `edit jadwal [No] jam [Jam] hari [Hari] ruangan [Ruang]`',
        '• *Hapus:* `hapus jadwal [No]`',
        '',
        '⏳ *3. JADWAL SEMENTARA / KELAS PENGGANTI*',
        '• *Tambah:* `tambah jadwal sementara matkul [Nama], tanggal [Tgl], jam mulai [Jam] jam selesai [Jam], ruangan [Ruang], status [Pengganti]`',
        '  _Contoh:_ `tambah jadwal sementara matkul Kecerdasan Buatan, tanggal 18 September 2026, jam mulai 09.00 jam selesai 11.00, ruangan Lab AI, status Kuliah Pengganti`',
        '• *Lihat:* `jadwal sementara`',
        '• *Edit:* `edit jadwal sementara [No] jam [Jam] ruangan [Ruang]`',
        '• *Hapus:* `hapus jadwal sementara [No]`',
        '',
        '👤 *4. PENANGGUNG JAWAB (PJ) MATKUL*',
        '• *Tambah:* `tambah pj [Nama] matkul [Nama Matkul] wa [Nomor WA]`',
        '  _Contoh:_ `tambah pj Rian matkul Machine Learning wa 081234567890`',
        '• *Lihat:* `list pj` | `pj kelas`',
        '• *Edit:* `edit pj [No], nama [Nama Baru] wa [Nomor Baru]`',
        '• *Hapus:* `hapus pj [No]`',
        '',
        '🧑‍🏫 *5. DATABASE DOSEN PENGAMPU*',
        '• *Tambah:* `tambah dosen [Nama], wa [Nomor WA]`',
        '  _Contoh:_ `tambah dosen Prof. Siti Aminah, wa 081122334455`',
        '• *Lihat:* `dosen` | `list dosen`',
        '• *Edit:* `edit dosen [No] wa [Nomor Baru]` / `nama [Nama Baru]`',
        '• *Hapus:* `hapus dosen [No]`',
        '',
        '📊 *6. ABSENSI RFID & KELAS*',
        '• *Set Kelas Grup:* `set kelas [Nama Kelas]` (cth: `set kelas 2026A`)',
        '• *Unset Kelas:* `unset kelas`',
        '• *Rekap Chat:* `absensi`',
        '• *Unduh Excel:* `download absensi` atau `rekap excel`',
        '━━━━━━━━━━━━━━━━━━━━━━━━',
        '💡 _Catatan: Perintah dapat diketik secara natural tanpa tanda kurung siku._'
    ].join('\n');
};

const buildMenuCategoryListText = () => buildFullCrudMenuText();

const buildTutorialCategoryListText = () => buildFullCrudMenuText();

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