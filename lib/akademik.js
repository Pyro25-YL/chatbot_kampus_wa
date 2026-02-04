const fs = require('fs');
const path = require('path');
const {
    buildMenuCategoryListText,
    buildMenuCategoryDetailText,
    buildMenuNavHintText,
    buildTutorialCategoryListText,
    normalizeMenuCategory,
    normalizeMenuNavigation,
    trackMenuList,
    trackMenuDetail,
    trackMenuResult,
    trackTutorialList,
    goBackMenuView
} = require('./menu');
const { wrapSend } = require('./send_queue');

const DATA_DIR = path.join(__dirname, '..', 'akademik');
const CLASSES_FILE = path.join(DATA_DIR, 'classes.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const ARCHIVE_FILE = path.join(DATA_DIR, 'arsiptugas.json');
const EXAMS_FILE = path.join(DATA_DIR, 'jadwalujian.json');
const PJ_FILE = path.join(DATA_DIR, 'pj.json');
const PJ_CONTACT_FILE = path.join(DATA_DIR, 'pj_kontak.json');
const DOSEN_FILE = path.join(DATA_DIR, 'dosen.json');
const GROUPS_FILE = path.join(DATA_DIR, 'groups.json');
const AUDIT_LOG_FILE = path.join(DATA_DIR, 'audit.log');
const EXPORT_DIR = path.join(DATA_DIR, 'exports');

const DEFAULT_WEEK = 1;

let data = {
    config: { currentWeek: DEFAULT_WEEK },
    kelas: {}
};
let currentWeek = DEFAULT_WEEK;
let loaded = false;

const STATUS_SEPARATOR = '--------------------';
const REMINDER_RULE_KEYS = [
    '1w',
    '5d',
    '3d',
    '1d',
    '12h',
    '6h',
    '3h',
    '1h',
    '30m'
];
const REMINDER_RULE_LABELS = {
    '1w': '1 minggu',
    '5d': '5 hari',
    '3d': '3 hari',
    '1d': '1 hari',
    '12h': '12 jam',
    '6h': '6 jam',
    '3h': '3 jam',
    '1h': '1 jam',
    '30m': '30 menit'
};

const buildHelpText = (adminContacts) => {
    const contacts = Array.isArray(adminContacts)
        ? adminContacts.filter(Boolean)
        : [];
    const lines = [
        '🆘 Bantuan',
        'Jika bot error atau ada kendala, silakan hubungi admin bot:'
    ];
    if (!contacts.length) {
        lines.push('- (admin belum diatur)');
    } else {
        contacts.forEach((number) => {
            lines.push(`- ${number}`);
        });
    }
    lines.push('', 'Tips: ketik !menu untuk daftar fitur.');
    return lines.join('\n');
};

const buildStatusHeader = (defaultKelas) => {
    const kelasLabel = defaultKelas || '-';
    return `📌 Status: Kelas default: ${kelasLabel} | Minggu aktif: ${currentWeek}`;
};

const wrapWithStatus = (text, defaultKelas) => {
    if (!text) return text;
    return `${buildStatusHeader(defaultKelas)}\n${STATUS_SEPARATOR}\n${text}`;
};

const normalizeReminderRuleInput = (token) => {
    const cleaned = (token || '').toLowerCase().replace(/[^\w]/g, '');
    if (!cleaned) return null;
    if (REMINDER_RULE_KEYS.includes(cleaned)) return cleaned;
    const match = cleaned.match(/^(\d+)(w|d|h|m)$/);
    if (!match) return null;
    const value = Number(match[1]);
    const unit = match[2];
    const key = `${value}${unit}`;
    return REMINDER_RULE_KEYS.includes(key) ? key : null;
};

const parseReminderRuleTokens = (input) => {
    const tokens = (input || '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
    const keys = [];
    for (const token of tokens) {
        const parts = token.split(/\s+/).filter(Boolean);
        for (const part of parts) {
            const normalized = normalizeReminderRuleInput(part);
            if (normalized && !keys.includes(normalized)) keys.push(normalized);
        }
    }
    return keys;
};

const SEARCH_STATE = new Map();
const SEARCH_PAGE_SIZE = 5;

const normalizeSearchType = (input) => {
    const raw = (input || '').toLowerCase();
    if (raw.startsWith('dosen') || raw.startsWith('pengajar')) return 'dosen';
    if (raw.startsWith('jadwal') || raw.startsWith('matkul')) return 'jadwal';
    return null;
};

const buildSearchHeader = (type, query) => {
    if (type === 'dosen') return `🔎 Hasil cari dosen: *${query}*`;
    return `🔎 Hasil cari jadwal: *${query}*`;
};

const buildSearchResults = (type, query) => {
    const needle = query.toLowerCase();
    const results = [];

    for (const [kelasNama, kelasData] of Object.entries(data.kelas)) {
        for (const mk of kelasData.matkul || []) {
            if (type === 'dosen') {
                if (!mk.dosen || !mk.dosen.toLowerCase().includes(needle)) continue;
                results.push(
                    `- *${mk.dosen}* | Kelas ${kelasNama} - *${mk.nama}* (${mk.kode}), ${namaHari(
                        mk.hari
                    )} ${mk.jam} di ${mk.ruangan}`
                );
            } else {
                const nameMatch = (mk.nama || '').toLowerCase().includes(needle);
                const codeMatch = (mk.kode || '').toLowerCase().includes(needle);
                if (!nameMatch && !codeMatch) continue;
                results.push(
                    `- Kelas ${kelasNama} - *${mk.nama}* (${mk.kode}), ${namaHari(
                        mk.hari
                    )} ${mk.jam} di ${mk.ruangan} | Dosen *${mk.dosen}*`
                );
            }
        }
    }

    return results;
};

const buildSearchText = (state) => {
    const totalPages = Math.max(1, Math.ceil(state.results.length / SEARCH_PAGE_SIZE));
    const page = Math.min(Math.max(state.page, 1), totalPages);
    const start = (page - 1) * SEARCH_PAGE_SIZE;
    const end = Math.min(state.results.length, start + SEARCH_PAGE_SIZE);

    const lines = [buildSearchHeader(state.type, state.query)];

    if (!state.results.length) {
        lines.push('Tidak ada data yang cocok.');
        return lines.join('\n');
    }

    for (const item of state.results.slice(start, end)) {
        lines.push(item);
    }

    if (totalPages > 1) {
        lines.push(
            '',
            `Halaman ${page}/${totalPages}`,
            'Ketik: !cari next | !cari prev'
        );
    }

    return lines.join('\n');
};

const updateSearchState = (chatId, state) => {
    if (!chatId) return;
    SEARCH_STATE.set(chatId, state);
};

const getSearchState = (chatId) => {
    if (!chatId) return null;
    return SEARCH_STATE.get(chatId) || null;
};

const normalizeSearchNav = (input) => {
    const raw = (input || '').toLowerCase().trim();
    if (raw === 'next' || raw === 'lanjut') return 'next';
    if (raw === 'prev' || raw === 'previous' || raw === 'sebelumnya') return 'prev';
    return null;
};

const ensureDir = () => {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
};

const readJson = (filePath, fallback) => {
    try {
        if (!fs.existsSync(filePath)) return fallback;
        const raw = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(raw);
    } catch (e) {
        return fallback;
    }
};

const loadData = () => {
    ensureDir();
    const configRaw = readJson(CONFIG_FILE, {});
    const classesRaw = readJson(CLASSES_FILE, {});
    data.config = {
        currentWeek:
            typeof configRaw.currentWeek === 'number' ? configRaw.currentWeek : DEFAULT_WEEK
    };
    data.kelas = classesRaw.kelas || {};
    const pjData = loadPjData();
    applyPjToClasses(pjData);
    currentWeek = data.config.currentWeek;
    loaded = true;
};

const ensureLoaded = () => {
    if (!loaded) loadData();
};

const saveData = () => {
    ensureDir();
    data.config.currentWeek = currentWeek;
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ currentWeek }, null, 2), 'utf8');
    fs.writeFileSync(CLASSES_FILE, JSON.stringify({ kelas: data.kelas }, null, 2), 'utf8');
};

const loadArchiveData = () => {
    ensureDir();
    return readJson(ARCHIVE_FILE, []);
};

const saveArchiveData = (archive) => {
    ensureDir();
    fs.writeFileSync(ARCHIVE_FILE, JSON.stringify(archive, null, 2), 'utf8');
};

const loadGroupSettingsFile = () => {
    ensureDir();
    return readJson(GROUPS_FILE, {});
};

const saveGroupSettingsFile = (groupSettings) => {
    ensureDir();
    fs.writeFileSync(GROUPS_FILE, JSON.stringify(groupSettings, null, 2), 'utf8');
};

const appendAuditLog = (entry) => {
    ensureDir();
    fs.appendFileSync(AUDIT_LOG_FILE, JSON.stringify(entry) + '\n', 'utf8');
};

const formatAuditDetails = (details) => {
    if (!details || typeof details !== 'object') {
        return details ? String(details) : '-';
    }
    const entries = Object.entries(details);
    if (!entries.length) return '-';
    return entries
        .map(([key, value]) => {
            const val = typeof value === 'string' ? value : JSON.stringify(value);
            return `${key}=${val}`;
        })
        .join(', ');
};

const readAuditLogEntries = (limit = 10, chatId = null) => {
    if (!fs.existsSync(AUDIT_LOG_FILE)) return [];
    const raw = fs.readFileSync(AUDIT_LOG_FILE, 'utf8');
    const lines = raw.split('\n').filter(Boolean);
    const entries = [];

    for (let i = lines.length - 1; i >= 0 && entries.length < limit; i -= 1) {
        try {
            const entry = JSON.parse(lines[i]);
            if (chatId && entry.chatId !== chatId) continue;
            entries.push(entry);
        } catch (e) {
            continue;
        }
    }

    return entries.reverse();
};

const buildAuditLogText = (entries) => {
    if (!entries.length) return 'Audit log masih kosong.';
    const lines = ['🧾 Audit log (terbaru):'];

    entries.forEach((entry, idx) => {
        const when = entry.ts
            ? new Date(entry.ts).toLocaleString('en-GB')
            : '-';
        const actor = entry.actorName
            ? `${entry.actorName} (${entry.actorId || '-'})`
            : entry.actorId || '-';
        lines.push(`${idx + 1}. ${when} | ${entry.action} | ${actor}`);

        const details = formatAuditDetails(entry.details);
        if (details && details !== '-') {
            lines.push(`   Detail: ${details}`);
        }
    });

    return lines.join('\n');
};

const ensureExportDir = () => {
    if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR, { recursive: true });
};

const buildExportPayload = () => ({
    meta: {
        exportedAt: new Date().toISOString(),
        version: 1
    },
    data: {
        config: readJson(CONFIG_FILE, { currentWeek }),
        classes: readJson(CLASSES_FILE, { kelas: data.kelas || {} }),
        pj: readJson(PJ_FILE, { kelas: {} }),
        dosen: readJson(DOSEN_FILE, {}),
        arsip: readJson(ARCHIVE_FILE, []),
        ujian: readJson(EXAMS_FILE, { exams: [] }),
        pjContacts: readJson(PJ_CONTACT_FILE, {}),
        groups: loadGroupSettingsFile()
    }
});

const writeExportFile = (payload, label = null) => {
    ensureExportDir();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const suffix = label ? `-${label}` : '';
    const fileName = `export${suffix}-${stamp}.json`;
    const filePath = path.join(EXPORT_DIR, fileName);
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
    return filePath;
};

const resolveImportPath = (input) => {
    if (!input) return null;
    ensureExportDir();
    if (input === 'latest') {
        const files = fs
            .readdirSync(EXPORT_DIR)
            .filter((name) => name.toLowerCase().endsWith('.json'))
            .sort();
        if (!files.length) return null;
        return path.join(EXPORT_DIR, files[files.length - 1]);
    }
    const candidate = path.isAbsolute(input)
        ? input
        : path.join(EXPORT_DIR, input);
    const resolved = path.resolve(candidate);
    const dataRoot = path.resolve(DATA_DIR);
    if (!resolved.startsWith(dataRoot)) return null;
    if (!fs.existsSync(resolved)) return null;
    return resolved;
};

const importDataPayload = (payload) => {
    const dataBlock = payload?.data || payload || {};
    const config = dataBlock.config || readJson(CONFIG_FILE, { currentWeek });
    const classes = dataBlock.classes || readJson(CLASSES_FILE, { kelas: {} });
    const pj = dataBlock.pj || readJson(PJ_FILE, { kelas: {} });
    const dosen = dataBlock.dosen || readJson(DOSEN_FILE, {});
    const arsip = dataBlock.arsip || readJson(ARCHIVE_FILE, []);
    const ujian = dataBlock.ujian || readJson(EXAMS_FILE, { exams: [] });
    const pjContacts = dataBlock.pjContacts || readJson(PJ_CONTACT_FILE, {});
    const groups = dataBlock.groups || loadGroupSettingsFile();

    ensureDir();
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
    fs.writeFileSync(CLASSES_FILE, JSON.stringify(classes, null, 2), 'utf8');
    fs.writeFileSync(PJ_FILE, JSON.stringify(pj, null, 2), 'utf8');
    fs.writeFileSync(DOSEN_FILE, JSON.stringify(dosen, null, 2), 'utf8');
    fs.writeFileSync(ARCHIVE_FILE, JSON.stringify(arsip, null, 2), 'utf8');
    fs.writeFileSync(EXAMS_FILE, JSON.stringify(ujian, null, 2), 'utf8');
    fs.writeFileSync(PJ_CONTACT_FILE, JSON.stringify(pjContacts, null, 2), 'utf8');
    saveGroupSettingsFile(groups);
};
const loadExamSchedule = () => {
    ensureDir();
    return readJson(EXAMS_FILE, { exams: [] });
};

const loadPjData = () => {
    ensureDir();
    const parsed = readJson(PJ_FILE, {});
    return parsed.kelas || {};
};

const loadPjContacts = () => {
    ensureDir();
    const parsed = readJson(PJ_CONTACT_FILE, {});
    if (parsed && typeof parsed === 'object') {
        if (parsed.contacts && typeof parsed.contacts === 'object') return parsed.contacts;
        return parsed;
    }
    return {};
};

const savePjContacts = (contacts) => {
    ensureDir();
    fs.writeFileSync(
        PJ_CONTACT_FILE,
        JSON.stringify({ contacts }, null, 2),
        'utf8'
    );
};

const loadDosenData = () => {
    ensureDir();
    return readJson(DOSEN_FILE, {});
};

const saveDosenData = (dataMap) => {
    ensureDir();
    fs.writeFileSync(DOSEN_FILE, JSON.stringify(dataMap, null, 2), 'utf8');
};

const DOSEN_NAME_STOPWORDS = new Set([
    'dr',
    'drs',
    'prof',
    'ir',
    'bapak',
    'ibu',
    'pak',
    'bu',
    's',
    'm',
    'sc',
    'msc',
    'kom',
    'si',
    'pd',
    'or',
    'st',
    'mt',
    'phd',
    'mm',
    'se'
]);

const normalizeDosenTokens = (input) => {
    const raw = (input || '').toLowerCase();
    const cleaned = raw.replace(/[^a-z0-9\s]/g, ' ');
    const tokens = cleaned.split(/\s+/).filter(Boolean);
    return tokens.filter((token) => token.length > 1 && !DOSEN_NAME_STOPWORDS.has(token));
};

const isDosenQueryMatch = (queryTokens, candidateName) => {
    if (!candidateName || !queryTokens.length) return false;
    const nameTokens = normalizeDosenTokens(candidateName);
    if (!nameTokens.length) return false;
    const queryKey = queryTokens.join(' ');
    const nameKey = nameTokens.join(' ');
    if (queryKey && nameKey.includes(queryKey)) return true;
    return queryTokens.every((token) =>
        nameTokens.some((nameToken) => nameToken.startsWith(token) || nameToken.includes(token))
    );
};

const buildDosenAmbiguousText = (query, names) => {
    const list = Array.from(new Set(names)).sort((a, b) =>
        a.localeCompare(b, 'id')
    );
    if (!list.length) {
        return `Nama dosen "${query}" tidak ditemukan.`;
    }
    let text = `Nama dosen "${query}" terlalu umum. Ditemukan beberapa nama:`;
    list.forEach((name, idx) => {
        text += `\n${idx + 1}. ${name}`;
    });
    const hint = list[0]
        ? list[0].split(' ').slice(0, 2).join(' ')
        : query;
    text += `\nKetik ulang dengan nama lebih spesifik. Contoh: !dosenbesok ${hint}`;
    return text.trim();
};

const getDosenTelegram = (namaDosen, dosenMap) => {
    if (!namaDosen) return null;
    const key = namaDosen.toLowerCase();
    return dosenMap[key] || null;
};

const getPjContact = (namaPJ, pjContacts) => {
    if (!namaPJ) return null;
    const key = namaPJ.toLowerCase();
    return pjContacts[key] || null;
};

const refreshPjFromFile = () => {
    const pjData = loadPjData();
    applyPjToClasses(pjData);
};

const applyPjToClasses = (pjData) => {
    if (!pjData || typeof pjData !== 'object') return;
    for (const [kelasNama, kelasData] of Object.entries(data.kelas || {})) {
        const pjKelasRaw = pjData[kelasNama];
        if (!pjKelasRaw || typeof pjKelasRaw !== 'object') continue;

        const pjKelas = {};
        for (const [mkName, pjName] of Object.entries(pjKelasRaw)) {
            pjKelas[mkName.toLowerCase()] = pjName;
        }

        for (const mk of kelasData.matkul || []) {
            const key = (mk.nama || '').toLowerCase();
            const kodeKey = (mk.kode || '').toLowerCase();
            if (key && pjKelas[key]) {
                mk.pj = pjKelas[key];
            } else if (kodeKey && pjKelas[kodeKey]) {
                mk.pj = pjKelas[kodeKey];
            }
        }
    }
};

const getOrCreateKelas = (nama) => {
    const key = nama.trim();
    if (!data.kelas[key]) {
        data.kelas[key] = { matkul: [], tugas: [] };
    }
    return data.kelas[key];
};

const findKelasKey = (kelasNama) => {
    if (!kelasNama) return null;
    const existing = Object.keys(data.kelas || {}).find(
        (k) => k.toLowerCase() === kelasNama.toLowerCase()
    );
    return existing || kelasNama;
};

const namaHari = (kode) => {
    const map = {
        1: 'Senin',
        2: 'Selasa',
        3: 'Rabu',
        4: 'Kamis',
        5: 'Jumat',
        6: 'Sabtu',
        7: 'Minggu'
    };
    return map[kode] || 'Tidak valid';
};

const hariSekarangKode = () => {
    const d = new Date().getDay();
    if (d === 0) return 7;
    return d;
};

const labelMatkul = (kelasData, tugas) => {
    const mk = kelasData.matkul.find(
        (m) => m.kode === tugas.matkulTerkait || m.nama === tugas.matkulTerkait
    );
    return mk ? `${mk.nama} (${mk.kode})` : tugas.matkulTerkait;
};

const tugasAktifUntukMatkul = (kelasData, mk) => {
    return kelasData.tugas.filter(
        (t) =>
            !t.selesai &&
            (t.matkulTerkait === mk.kode || t.matkulTerkait === mk.nama)
    );
};

const parseDeadlineDate = (ddmmyy) => {
    const parts = ddmmyy.split('/').map((p) => p.trim());
    if (parts.length !== 3) return null;
    const [dStr, mStr, yStr] = parts;
    const d = Number(dStr);
    const m = Number(mStr);
    let y = Number(yStr);
    if (!Number.isInteger(d) || !Number.isInteger(m) || !Number.isInteger(y)) {
        return null;
    }
    if (d < 1 || d > 31 || m < 1 || m > 12) return null;
    if (y < 100) y += 2000;
    const date = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
    if (
        date.getUTCFullYear() !== y ||
        date.getUTCMonth() !== m - 1 ||
        date.getUTCDate() !== d
    ) {
        return null;
    }
    return date;
};

const formatTimeLeft = (deadline) => {
    const diff = deadline.getTime() - Date.now();
    if (diff <= 0) return 'Lewat deadline';
    const mins = Math.floor(diff / 60000);
    const days = Math.floor(mins / (60 * 24));
    const hours = Math.floor((mins % (60 * 24)) / 60);
    const minutes = mins % 60;
    const parts = [];
    if (days) parts.push(`${days}h`);
    if (hours) parts.push(`${hours}j`);
    parts.push(`${minutes}m`);
    return parts.join(' ');
};

const getTugasPengumpulan = (tugas) =>
    tugas.pengumpulan ||
    tugas.tempatPengumpulan ||
    tugas.tempatKumpul ||
    tugas.pengumpulanTempat ||
    tugas.pengumpulanVia ||
    tugas.tempat ||
    '-';

const getTugasDeadlineInfo = (tugas) => {
    const dl = tugas.deadlineDate ? new Date(tugas.deadlineDate) : null;
    const validDate = dl && !isNaN(dl.getTime());
    const hariFromDate = validDate
        ? namaHari(dl.getUTCDay() === 0 ? 7 : dl.getUTCDay())
        : null;
    const hariFromWeek =
        typeof tugas.hariDeadline === 'number' ? namaHari(tugas.hariDeadline) : null;
    const deadlineText = validDate
        ? dl.toLocaleDateString('en-GB')
        : tugas.mingguKe && hariFromWeek
            ? `Minggu ${tugas.mingguKe}, ${hariFromWeek}`
            : '-';
    const hariText = hariFromDate || hariFromWeek || '-';
    const sisaText = validDate ? formatTimeLeft(dl) : '-';
    return { deadlineText, hariText, sisaText };
};

const buildTugasDetailItemText = (kelasData, tugas, index) => {
    const label = labelMatkul(kelasData, tugas);
    const { deadlineText, hariText, sisaText } = getTugasDeadlineInfo(tugas);
    const jenis = tugas.jenis || '-';
    const pengumpulan = getTugasPengumpulan(tugas) || '-';
    const ket = tugas.deskripsi || '-';

    return `${index}. *${tugas.namaTugas}* (*${label}*)\n` +
        `   🗓️ Deadline: ${deadlineText}\n` +
        `   📅 Hari     : ${hariText}\n` +
        `   ⏳ Sisa     : ${sisaText}\n` +
        `   📝 Jenis    : ${jenis}\n` +
        `   📮 Pengumpulan: ${pengumpulan}\n` +
        `   🧾 Ket      : ${ket}`;
};

const isTomorrow = (date) => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    return (
        date.getFullYear() === tomorrow.getFullYear() &&
        date.getMonth() === tomorrow.getMonth() &&
        date.getDate() === tomorrow.getDate()
    );
};

const jadwalSemuaText = (kelasNama) => {
    const kelasData = data.kelas[kelasNama];
    if (!kelasData) {
        return `Kelas ${kelasNama} belum terdaftar. Gunakan !addmatkul dulu.`;
    }
    if (!kelasData.matkul || kelasData.matkul.length === 0) {
        return `Belum ada matkul untuk kelas ${kelasNama}.`;
    }

    let text = `📅 Jadwal semua kuliah - Kelas ${kelasNama}:\n`;
    const list = [...kelasData.matkul];
    list.sort((a, b) => {
        if (a.hari !== b.hari) return a.hari - b.hari;
        if (a.jam < b.jam) return -1;
        if (a.jam > b.jam) return 1;
        return 0;
    });

    for (const mk of list) {
        text += `\n- *${mk.nama}* (${mk.kode})\n`;
        text += `  📅 Hari : ${namaHari(mk.hari)}\n`;
        text += `  ⏰ Jam  : ${mk.jam}\n`;
        text += `  🏫 Ruang: ${mk.ruangan}\n`;
        text += `  👨‍🏫 Dosen: *${mk.dosen}*\n`;
        text += `  🧑‍💼 PJ   : ${mk.pj || '-'}\n`;
    }

    return text.trim();
};

const jadwalSemuaKelasText = () => {
    let text = '📅 Jadwal semua kuliah - semua kelas:\n';
    let ada = false;

    for (const [kelasNama, kelasData] of Object.entries(data.kelas)) {
        const list = (kelasData.matkul || []).slice();
        if (!list.length) continue;

        ada = true;
        list.sort((a, b) => {
            if (a.hari !== b.hari) return a.hari - b.hari;
            if (a.jam < b.jam) return -1;
            if (a.jam > b.jam) return 1;
            return 0;
        });

        text += `\nKelas ${kelasNama}:\n`;
        for (const mk of list) {
            text += `- *${mk.nama}* (${mk.kode})\n`;
            text += `  📅 Hari : ${namaHari(mk.hari)}\n`;
            text += `  ⏰ Jam  : ${mk.jam}\n`;
            text += `  🏫 Ruang: ${mk.ruangan}\n`;
            text += `  👨‍🏫 Dosen: *${mk.dosen}*\n`;
            text += `  🧑‍💼 PJ   : ${mk.pj || '-'}\n`;
        }
    }

    if (!ada) {
        return 'Belum ada matkul yang tercatat untuk kelas manapun.';
    }

    return text.trim();
};

const jadwalBesokText = (kelasNama) => {
    const kelasData = data.kelas[kelasNama];
    if (!kelasData) {
        return `Kelas ${kelasNama} belum terdaftar. Gunakan !addmatkul dulu.`;
    }

    const hariIni = hariSekarangKode();
    const hariBesok = (hariIni % 7) + 1;

    let text = `⏰ Jadwal besok (${namaHari(hariBesok)}) - Kelas ${kelasNama}\n`;
    let ada = false;

    for (const mk of kelasData.matkul) {
        if (mk.hari === hariBesok) {
            ada = true;
            text += `\n- *${mk.nama}* (${mk.kode})\n`;
            text += `  👨‍🏫 Dosen: *${mk.dosen}*\n`;
            text += `  ⏰ Jam  : ${mk.jam}\n`;
            text += `  🏫 Ruang: ${mk.ruangan}\n`;

            const tugasMk = tugasAktifUntukMatkul(kelasData, mk);
            if (tugasMk.length === 0) {
                text += '  Tugas terkait: -\n';
            } else {
                text += '  Tugas terkait:\n';
                for (const t of tugasMk) {
                    const lewat =
                        t.mingguKe < currentWeek ||
                        (t.mingguKe === currentWeek && t.hariDeadline < hariIni);
                    text += `   - *${t.namaTugas}* [${t.jenis}]`;
                    if (lewat) text += ' (LEWAT DEADLINE)';
                    text += `\n     🗓️ Deadline: ${namaHari(t.hariDeadline)}, minggu ke-${t.mingguKe}\n`;
                }
            }
        }
    }

    if (!ada) {
        text += `\nTidak ada kuliah besok untuk kelas ${kelasNama}.`;
    }

    return text.trim();
};

const jadwalBesokAllText = () => {
    const hariIni = hariSekarangKode();
    const hariBesok = (hariIni % 7) + 1;

    let text = `⏰ Jadwal besok (${namaHari(hariBesok)}) - semua kelas:\n`;
    let ada = false;

    for (const [kelasNama, kelasData] of Object.entries(data.kelas)) {
        if (!kelasData.matkul || !kelasData.matkul.length) continue;

        let adaDiKelas = false;
        let bagian = '';

        for (const mk of kelasData.matkul) {
            if (mk.hari === hariBesok) {
                ada = true;
                adaDiKelas = true;
                bagian += `\n- *${mk.nama}* (${mk.kode})\n`;
                bagian += `  👨‍🏫 Dosen: *${mk.dosen}*\n`;
                bagian += `  ⏰ Jam  : ${mk.jam}\n`;
                bagian += `  🏫 Ruang: ${mk.ruangan}\n`;

                const tugasMk = tugasAktifUntukMatkul(kelasData, mk);
                if (tugasMk.length === 0) {
                    bagian += '  Tugas terkait: -\n';
                } else {
                    bagian += '  Tugas terkait:\n';
                    for (const t of tugasMk) {
                        const lewat =
                            t.mingguKe < currentWeek ||
                            (t.mingguKe === currentWeek && t.hariDeadline < hariIni);
                        bagian += `   - *${t.namaTugas}* [${t.jenis}]`;
                        if (lewat) bagian += ' (LEWAT DEADLINE)';
                        bagian += `\n     🗓️ Deadline: ${namaHari(t.hariDeadline)}, minggu ke-${t.mingguKe}\n`;
                    }
                }
            }
        }

        if (adaDiKelas) {
            text += `\nKelas ${kelasNama}:\n${bagian}`;
        }
    }

    if (!ada) {
        return 'Tidak ada kuliah besok untuk semua kelas.';
    }

    return text.trim();
};

const tugasMingguIniText = (kelasNama) => {
    const kelasData = data.kelas[kelasNama];
    if (!kelasData) return `Kelas ${kelasNama} belum terdaftar.`;

    const aktif = kelasData.tugas.filter(
        (t) => t.mingguKe === currentWeek && !t.selesai
    );

    if (aktif.length === 0) {
        return `Tidak ada tugas aktif di minggu ke-${currentWeek} untuk kelas ${kelasNama}.`;
    }

    let text = `📌 Tugas minggu ke-${currentWeek} - Kelas ${kelasNama}:\n`;
    aktif.forEach((t, idx) => {
        text += `\n${buildTugasDetailItemText(kelasData, t, idx + 1)}`;
    });
    return text.trim();
};

const tugasMingguIniAllText = () => {
    let text = `📌 Tugas minggu ke-${currentWeek} - semua kelas:\n`;
    let ada = false;

    for (const [kelasNama, kelasData] of Object.entries(data.kelas)) {
        const aktif = (kelasData.tugas || []).filter(
            (t) => t.mingguKe === currentWeek && !t.selesai
        );
        if (!aktif.length) continue;

        ada = true;
        text += `\nKelas ${kelasNama}:`;
        aktif.forEach((t, idx) => {
            text += `\n${buildTugasDetailItemText(kelasData, t, idx + 1)}`;
        });
    }

    if (!ada) {
        return `Tidak ada tugas aktif di minggu ke-${currentWeek} untuk semua kelas.`;
    }
    return text.trim();
};

const tugasBesokText = (kelasNama) => {
    const kelasData = data.kelas[kelasNama];
    if (!kelasData) return `Kelas ${kelasNama} belum terdaftar.`;

    const hariIni = hariSekarangKode();
    const hariBesok = (hariIni % 7) + 1;

    const besok = kelasData.tugas.filter((t) => {
        if (t.selesai) return false;
        if (t.deadlineDate) {
            const d = new Date(t.deadlineDate);
            if (isNaN(d.getTime())) return false;
            return isTomorrow(d);
        }
        return t.mingguKe === currentWeek && t.hariDeadline === hariBesok;
    });

    if (besok.length === 0) {
        return `Tidak ada tugas yang deadline-nya besok (${namaHari(
            hariBesok
        )}) untuk kelas ${kelasNama}.`;
    }

    let text = `⏰ Tugas yang deadline-nya besok (${namaHari(
        hariBesok
    )}) - Kelas ${kelasNama}:\n`;
    besok.forEach((t, idx) => {
        text += `\n${buildTugasDetailItemText(kelasData, t, idx + 1)}`;
    });
    return text.trim();
};

const tugasBesokAllText = () => {
    const hariIni = hariSekarangKode();
    const hariBesok = (hariIni % 7) + 1;

    let text = `⏰ Tugas yang deadline-nya besok (${namaHari(
        hariBesok
    )}) - semua kelas:\n`;
    let ada = false;

    for (const [kelasNama, kelasData] of Object.entries(data.kelas)) {
        const besok = (kelasData.tugas || []).filter((t) => {
            if (t.selesai) return false;
            if (t.deadlineDate) {
                const d = new Date(t.deadlineDate);
                if (isNaN(d.getTime())) return false;
                return isTomorrow(d);
            }
            return t.mingguKe === currentWeek && t.hariDeadline === hariBesok;
        });
        if (!besok.length) continue;

        ada = true;
        text += `\nKelas ${kelasNama}:`;
        besok.forEach((t, idx) => {
            text += `\n${buildTugasDetailItemText(kelasData, t, idx + 1)}`;
        });
    }

    if (!ada) {
        return `Tidak ada tugas yang deadline-nya besok (${namaHari(
            hariBesok
        )}) untuk semua kelas.`;
    }
    return text.trim();
};

const tugasOverdueText = (kelasNama) => {
    const kelasData = data.kelas[kelasNama];
    if (!kelasData) return `Kelas ${kelasNama} belum terdaftar.`;

    const hariIni = hariSekarangKode();
    const now = Date.now();
    const overdue = kelasData.tugas.filter((t) => {
        if (t.selesai) return false;
        if (t.deadlineDate) {
            const d = new Date(t.deadlineDate).getTime();
            return d < now;
        }
        if (t.mingguKe < currentWeek) return true;
        if (t.mingguKe === currentWeek && t.hariDeadline < hariIni) return true;
        return false;
    });

    if (overdue.length === 0) {
        return `Tidak ada tugas yang lewat deadline untuk kelas ${kelasNama}.`;
    }

    let text = `⚠️ Tugas yang sudah lewat deadline - Kelas ${kelasNama}:\n`;
    overdue.forEach((t, idx) => {
        text += `\n${buildTugasDetailItemText(kelasData, t, idx + 1)}`;
    });
    return text.trim();
};

const tugasOverdueAllText = () => {
    const hariIni = hariSekarangKode();
    const now = Date.now();
    let text = '⚠️ Tugas yang sudah lewat deadline - semua kelas:\n';
    let ada = false;

    for (const [kelasNama, kelasData] of Object.entries(data.kelas)) {
        const overdue = (kelasData.tugas || []).filter((t) => {
            if (t.selesai) return false;
            if (t.deadlineDate) {
                const d = new Date(t.deadlineDate).getTime();
                return d < now;
            }
            if (t.mingguKe < currentWeek) return true;
            if (t.mingguKe === currentWeek && t.hariDeadline < hariIni) return true;
            return false;
        });

        if (!overdue.length) continue;

        ada = true;
        text += `\nKelas ${kelasNama}:`;
        overdue.forEach((t, idx) => {
            text += `\n${buildTugasDetailItemText(kelasData, t, idx + 1)}`;
        });
    }

    if (!ada) {
        return 'Tidak ada tugas yang lewat deadline untuk semua kelas.';
    }
    return text.trim();
};

const tugasListText = (kelasNama) => {
    const kelasData = data.kelas[kelasNama];
    if (!kelasData) return `Kelas ${kelasNama} belum terdaftar.`;

    if (kelasData.tugas.length === 0) {
        return `Belum ada tugas untuk kelas ${kelasNama}.`;
    }

    let text = `📚 Daftar tugas - Kelas ${kelasNama}:\n`;
    kelasData.tugas.forEach((t, idx) => {
        text += `\n${buildTugasDetailItemText(kelasData, t, idx + 1)}`;
    });
    return text.trim();
};

const tugasListAllText = () => {
    let text = '📚 Daftar semua tugas - semua kelas:';
    let ada = false;

    for (const [kelasNama, kelasData] of Object.entries(data.kelas)) {
        const list = kelasData.tugas || [];
        if (!list.length) continue;

        ada = true;
        text += `\n\nKelas ${kelasNama}:`;
        list.forEach((t, idx) => {
            text += `\n${buildTugasDetailItemText(kelasData, t, idx + 1)}`;
        });
    }

    if (!ada) {
        return 'Belum ada tugas yang tercatat untuk kelas manapun.';
    }
    return text.trim();
};

const sortMatkulByJam = (list) =>
    list.sort((a, b) => {
        const jamA = a.jam || '';
        const jamB = b.jam || '';
        if (jamA < jamB) return -1;
        if (jamA > jamB) return 1;
        return 0;
    });

const buildRingkasanJadwalHarian = (kelasKey) => {
    const hariIni = hariSekarangKode();
    const namaHariIni = namaHari(hariIni);

    if (kelasKey) {
        const kelasData = data.kelas[kelasKey];
        if (!kelasData) return `Kelas ${kelasKey} belum terdaftar.`;
        const list = (kelasData.matkul || []).filter((mk) => mk.hari === hariIni);
        if (!list.length) {
            return `📚 Jadwal hari ini (${namaHariIni}) - Kelas ${kelasKey}:\n- Tidak ada jadwal.`;
        }
        sortMatkulByJam(list);
        let text = `📚 Jadwal hari ini (${namaHariIni}) - Kelas ${kelasKey}:`;
        for (const mk of list) {
            text += `\n- *${mk.nama}* (${mk.kode}) | ${mk.jam} | ${mk.ruangan}`;
        }
        return text.trim();
    }

    let text = `📚 Jadwal hari ini (${namaHariIni}) - semua kelas:`;
    let ada = false;
    for (const [kelasNama, kelasData] of Object.entries(data.kelas)) {
        const list = (kelasData.matkul || []).filter((mk) => mk.hari === hariIni);
        if (!list.length) continue;
        ada = true;
        sortMatkulByJam(list);
        text += `\nKelas ${kelasNama}:`;
        for (const mk of list) {
            text += `\n- *${mk.nama}* (${mk.kode}) | ${mk.jam} | ${mk.ruangan}`;
        }
    }
    if (!ada) return 'Tidak ada jadwal hari ini untuk semua kelas.';
    return text.trim();
};

const buildRingkasanJadwalPekan = (kelasKey) => {
    if (!kelasKey) {
        return '📚 Jadwal pekan ini:\n- Gunakan !setkelas agar ringkasan jadwal lebih spesifik.';
    }
    const kelasData = data.kelas[kelasKey];
    if (!kelasData) return `Kelas ${kelasKey} belum terdaftar.`;

    const hariIni = hariSekarangKode();
    const hariList = Array.from({ length: 7 }, (_, i) => ((hariIni - 1 + i) % 7) + 1);

    let text = `📚 Jadwal 7 hari ke depan - Kelas ${kelasKey}:`;
    let ada = false;
    for (const hari of hariList) {
        const list = (kelasData.matkul || []).filter((mk) => mk.hari === hari);
        if (!list.length) continue;
        ada = true;
        sortMatkulByJam(list);
        text += `\n${namaHari(hari)}:`;
        for (const mk of list) {
            text += `\n- *${mk.nama}* (${mk.kode}) | ${mk.jam} | ${mk.ruangan}`;
        }
        text += '\n';
    }
    if (!ada) {
        return `Tidak ada jadwal kuliah 7 hari ke depan untuk kelas ${kelasKey}.`;
    }
    return text.trim();
};

const collectUpcomingTasks = (kelasKey, daysAhead) => {
    const now = new Date();
    const hariIni = hariSekarangKode();
    const limitMs = daysAhead * 24 * 60 * 60 * 1000;
    const items = [];
    const entries = kelasKey ? [[kelasKey, data.kelas[kelasKey]]] : Object.entries(data.kelas);

    for (const [kelasNama, kelasData] of entries) {
        if (!kelasData) continue;
        for (const t of kelasData.tugas || []) {
            if (t.selesai) continue;

            let dueLabel = null;
            let sortKey = null;

            if (t.deadlineDate) {
                const dl = new Date(t.deadlineDate);
                if (Number.isNaN(dl.getTime())) continue;
                const diffMs = dl.getTime() - now.getTime();
                if (diffMs < 0 || diffMs > limitMs) continue;
                dueLabel = dl.toLocaleString('en-GB');
                sortKey = dl.getTime();
            } else {
                if (t.mingguKe < currentWeek) continue;
                const daysUntil =
                    (t.mingguKe - currentWeek) * 7 + (t.hariDeadline - hariIni);
                if (daysUntil < 0 || daysUntil > daysAhead) continue;
                dueLabel = `Minggu ${t.mingguKe}, ${namaHari(t.hariDeadline)}`;
                sortKey = now.getTime() + daysUntil * 24 * 60 * 60 * 1000;
            }

            items.push({
                kelasNama,
                kelasData,
                tugas: t,
                dueLabel,
                sortKey
            });
        }
    }

    return items.sort((a, b) => (a.sortKey || 0) - (b.sortKey || 0));
};

const buildRingkasanTugas = (kelasKey, daysAhead) => {
    const items = collectUpcomingTasks(kelasKey, daysAhead);
    const labelDays = daysAhead === 1 ? '24 jam' : `${daysAhead} hari`;
    if (!items.length) {
        return `📝 Deadline dekat (${labelDays}):\n- Tidak ada tugas mendekati deadline.`;
    }

    let text = `📝 Deadline dekat (${labelDays}):`;
    for (const item of items) {
        const label = labelMatkul(item.kelasData, item.tugas);
        const kelasInfo = kelasKey ? '' : ` | Kelas ${item.kelasNama}`;
        text += `\n- *${item.tugas.namaTugas}* (*${label}*) [${
            item.tugas.jenis || '-'
        }] - ${item.dueLabel}${kelasInfo}`;
    }
    return text.trim();
};

const ringkasanHarianText = (kelasKey) => {
    const hariIni = hariSekarangKode();
    const header = `🧾 Ringkasan Harian (${namaHari(hariIni)})`;
    const jadwal = buildRingkasanJadwalHarian(kelasKey);
    const tugas = buildRingkasanTugas(kelasKey, 1);
    return `${header}\n${STATUS_SEPARATOR}\n${jadwal}\n${STATUS_SEPARATOR}\n${tugas}`.trim();
};

const ringkasanPekanText = (kelasKey) => {
    const header = '🧾 Ringkasan Pekan (7 hari ke depan)';
    const jadwal = buildRingkasanJadwalPekan(kelasKey);
    const tugas = buildRingkasanTugas(kelasKey, 7);
    return `${header}\n${STATUS_SEPARATOR}\n${jadwal}\n${STATUS_SEPARATOR}\n${tugas}`.trim();
};

const EXAM_MENU_HEADER = 'KATEGORI JADWAL UJIAN';
const EXAM_DETAIL_MARK = 'KATEGORI UJIAN:';
const EXAM_CATEGORIES = [
    { key: 'quiz', label: 'quiz', icon: '📝' },
    { key: 'uts', label: 'uts', icon: '📘' },
    { key: 'uas', label: 'uas', icon: '🎓' },
    { key: 'praktikum', label: 'praktikum', icon: '🧪' },
    { key: 'lainnya', label: 'ujian lainnya', icon: '🗂️' }
];

const getExamCategoryMeta = (key) =>
    EXAM_CATEGORIES.find((item) => item.key === key) ||
    EXAM_CATEGORIES[EXAM_CATEGORIES.length - 1];

const normalizeJadwalUjianCategory = (input) => {
    const raw = (input || '').toLowerCase();
    if (!raw) return null;
    const cleaned = raw.replace(/[^\w\s]/g, ' ').trim();
    if (!cleaned) return null;
    const tokens = cleaned.split(/\s+/);
    const hasToken = (list) => list.some((item) => tokens.includes(item));

    if (hasToken(['quiz', 'kuis', 'kuiz'])) return 'quiz';
    if (hasToken(['uts', 'mid', 'midterm']) || cleaned.includes('tengah semester')) {
        return 'uts';
    }
    if (hasToken(['uas', 'final']) || cleaned.includes('akhir semester')) {
        return 'uas';
    }
    if (hasToken(['praktikum', 'prak', 'lab'])) return 'praktikum';
    if (cleaned.includes('lain')) return 'lainnya';
    return null;
};

const inferDefaultExamCategory = (dataExam) => {
    const title = dataExam && dataExam.title ? dataExam.title : '';
    return normalizeJadwalUjianCategory(title) || 'lainnya';
};

const formatExamTitleForCategory = (title, categoryKey) => {
    if (!title) return '';
    if (categoryKey === 'uts') {
        return title.replace(/Akhir Semester/gi, 'Tengah Semester');
    }
    if (categoryKey === 'uas') {
        return title.replace(/Tengah Semester/gi, 'Akhir Semester');
    }
    return title;
};

const isJadwalUjianMenuText = (text) => {
    const body = (text || '').toLowerCase();
    return body.includes(EXAM_MENU_HEADER.toLowerCase());
};

const isJadwalUjianDetailText = (text) => {
    const body = (text || '').toLowerCase();
    return body.includes(EXAM_DETAIL_MARK.toLowerCase());
};

const buildJadwalUjianMenuText = () => {
    const lines = [`🧾 ${EXAM_MENU_HEADER}`, '', 'Balas pesan ini dengan salah satu kategori:'];
    EXAM_CATEGORIES.forEach((item) => lines.push(`- ${item.icon} ${item.label}`));
    lines.push('', 'Contoh balasan: uas', buildMenuNavHintText());
    return lines.join('\n');
};

const matchMatkulName = (matkulName, target) => {
    if (!matkulName || !target) return false;
    const mk = matkulName.toLowerCase();
    const key = target.toLowerCase();
    return mk === key || mk.includes(key) || key.includes(mk);
};

const findDosenPengampu = (mataKuliah) => {
    if (!mataKuliah) return null;
    const names = new Set();

    for (const kelasData of Object.values(data.kelas || {})) {
        for (const mk of kelasData.matkul || []) {
            if (!mk) continue;
            if (matchMatkulName(mk.nama, mataKuliah) || matchMatkulName(mk.kode, mataKuliah)) {
                if (mk.dosen) names.add(mk.dosen);
            }
        }
    }

    if (!names.size) return null;
    return Array.from(names).join(' / ');
};

const getExamInstructor = (exam, categoryKey) => {
    if (categoryKey === 'praktikum') {
        const asisten =
            exam.asisten ||
            exam.asistenPraktikum ||
            exam.asisten_praktikum ||
            exam.asistenLab;
        return asisten || '-';
    }

    const direct =
        exam.dosen ||
        exam.dosenPengampu ||
        exam.pengampu ||
        exam.pengajar ||
        exam.instruktur;
    if (direct) return direct;

    return findDosenPengampu(exam.mataKuliah || exam.nama || exam.matkul) || '-';
};

const formatExamLocations = (exam) => {
    const directLocation = exam.tempat || exam.lokasi || exam.ruang || exam.ruangan;
    if (directLocation) return [String(directLocation)];

    const kelasList = Array.isArray(exam.kelas) ? exam.kelas : [];
    if (!kelasList.length) return ['-'];

    return kelasList.map((kls) => {
        if (!kls || typeof kls !== 'object') return String(kls || '-');
        const nama = kls.nama ? `Kelas ${kls.nama}` : 'Kelas';
        const ket = kls.keterangan ? ` (${kls.keterangan})` : '';
        const ruang = kls.ruang || kls.tempat || kls.lokasi;
        if (ruang) return `${nama}${ket} - ${ruang}`;
        return `${nama}${ket}`.trim();
    });
};

const buildJadwalUjianDetailText = (categoryKey) => {
    ensureLoaded();
    const dataExam = loadExamSchedule();
    const exams = dataExam.exams || [];
    if (!exams.length) return 'Belum ada jadwal ujian yang tercatat.';

    const category = getExamCategoryMeta(categoryKey);
    const defaultCategory = inferDefaultExamCategory(dataExam);

    const filtered = exams.filter((exam) => {
        const rawCategory =
            exam.kategori || exam.jenis || exam.tipe || exam.category || exam.type;
        const examCategory =
            normalizeJadwalUjianCategory(rawCategory) || defaultCategory;
        return examCategory === category.key;
    });

    let text = `${category.icon} ${EXAM_DETAIL_MARK} ${category.label.toUpperCase()}`;
    if (dataExam.title) {
        text += `\n${formatExamTitleForCategory(dataExam.title, category.key)}`;
    }

    if (!filtered.length) {
        text += '\n\nBelum ada jadwal ujian untuk kategori ini.';
        text += `\n\n${buildMenuNavHintText()}`;
        return text.trim();
    }

    filtered.forEach((exam, idx) => {
        const namaUjian =
            exam.mataKuliah ||
            exam.nama ||
            exam.matkul ||
            exam.judul ||
            exam.ujian ||
            `Ujian ${idx + 1}`;
        const tanggal = exam.tanggal || exam.tgl || exam.hari || '-';
        const jam = exam.waktu || exam.jam || '-';
        const detail = exam.detail || exam.deskripsi || exam.rincian || '-';
        const keterangan = exam.keterangan || exam.catatan || '-';
        const instructor = getExamInstructor(exam, category.key);
        const locations = formatExamLocations(exam);
        const instrLabel = category.key === 'praktikum' ? 'Asisten' : 'Dosen';
        const instrIcon = category.key === 'praktikum' ? '🧑‍🔬' : '🧑‍🏫';

        text += `\n\n${idx + 1}. *${namaUjian}*`;
        text += `\n   📅 Tanggal : *${tanggal}*`;
        text += `\n   🕒 Jam     : *${jam}*`;
        text += `\n   ${instrIcon} ${instrLabel} : *${instructor}*`;

        if (locations.length > 1) {
            text += '\n   📍 Tempat  :';
            locations.forEach((loc) => {
                text += `\n     - *${loc}*`;
            });
        } else {
            text += `\n   📍 Tempat  : *${locations[0] || '-'}*`;
        }

        text += `\n   🧾 Detail  : ${detail}`;
        text += `\n   🗒️ Ket     : ${keterangan}`;
    });

    text += `\n\n${buildMenuNavHintText()}`;
    return text.trim();
};

const pjMatkulText = (kelasNama, namaPJ) => {
    refreshPjFromFile();
    const kelasData = data.kelas[kelasNama];
    if (!kelasData) return `Kelas ${kelasNama} belum terdaftar.`;

    const mkPJ = kelasData.matkul.filter(
        (m) => (m.pj || '').toLowerCase() === namaPJ.toLowerCase()
    );

    if (!mkPJ.length) {
        return `Di kelas ${kelasNama}, ${namaPJ} belum terdaftar sebagai PJ di matkul manapun.`;
    }

    let text = `👤 Matkul yang kamu PJ (*${namaPJ}*) - Kelas ${kelasNama}:\n`;
    for (const mk of mkPJ) {
        text += `\n- *${mk.nama}* (${mk.kode})\n`;
        text += `  📅 Hari : ${namaHari(mk.hari)}\n`;
        text += `  ⏰ Jam  : ${mk.jam}\n`;
        text += `  🏫 Ruang: ${mk.ruangan}\n`;
        text += `  👨‍🏫 Dosen: *${mk.dosen}*\n`;
    }
    return text.trim();
};

const pjReminderBesokText = (namaPJ) => {
    refreshPjFromFile();
    const hariIni = hariSekarangKode();
    const hariBesok = (hariIni % 7) + 1;

    let text = `🔔 Pengingat PJ (*${namaPJ}*) - konfirmasi kuliah besok (${namaHari(hariBesok)})`;
    let ada = false;

    for (const [kelasNama, kelasData] of Object.entries(data.kelas)) {
        for (const mk of kelasData.matkul) {
            if ((mk.pj || '').toLowerCase() === namaPJ.toLowerCase() && mk.hari === hariBesok) {
                ada = true;
                text += `\n\nKelas ${kelasNama} - *${mk.nama}* (${mk.kode})`;
                text += `\nJam ${mk.jam} di ${mk.ruangan} dengan *${mk.dosen}*`;
                text += `\nTemplate WA:\n> Halo ${mk.dosen}, izin konfirmasi, apakah besok kuliah ${mk.nama} jam ${mk.jam} di ${mk.ruangan} tetap berlangsung?`;
            }
        }
    }

    if (!ada) {
        return `Tidak ada matkul besok yang kamu jadi PJ-nya, ${namaPJ}.`;
    }
    return text.trim();
};

const pjsayaText = (namaPJ) => {
    refreshPjFromFile();
    let text = `🙋 Daftar semua matkul yang kamu PJ (*${namaPJ}*):\n`;
    let ada = false;

    for (const [kelasNama, kelasData] of Object.entries(data.kelas)) {
        for (const mk of kelasData.matkul) {
            if ((mk.pj || '').toLowerCase() === namaPJ.toLowerCase()) {
                ada = true;
                text += `\nKelas ${kelasNama} - *${mk.nama}* (${mk.kode})\n`;
                text += `  📅 Hari : ${namaHari(mk.hari)}\n`;
                text += `  ⏰ Jam  : ${mk.jam}\n`;
                text += `  🏫 Ruang: ${mk.ruangan}\n`;
                text += `  👨‍🏫 Dosen: *${mk.dosen}*\n`;
            }
        }
    }

    if (!ada) {
        return `Kamu belum terdaftar sebagai PJ di matkul manapun, ${namaPJ}.`;
    }
    return text.trim();
};

const pjAllText = () => {
    refreshPjFromFile();
    const pjMap = {};
    const pjContacts = loadPjContacts();

    for (const [kelasNama, kelasData] of Object.entries(data.kelas)) {
        for (const mk of kelasData.matkul || []) {
            if (!mk.pj) continue;
            const key = mk.pj.toLowerCase();
            if (!pjMap[key]) {
                pjMap[key] = { nama: mk.pj, list: [] };
            }
            pjMap[key].list.push({ kelasNama, mk });
        }
    }

    const keys = Object.keys(pjMap);
    if (!keys.length) {
        return 'Belum ada PJ yang terdaftar di matkul manapun.';
    }

    let text = '👥 Daftar semua PJ & matkul yang dipegang:';
    keys.forEach((key, idx) => {
        const group = pjMap[key];
        const contact = getPjContact(group.nama, pjContacts);
        const contactLabel = contact ? `*${contact}*` : '-';
        text += `\n\n${idx + 1}. *${group.nama}*:`;
        text += `\n   📞 Nomor : ${contactLabel}`;
        for (const { kelasNama, mk } of group.list) {
            text += `\n- Kelas ${kelasNama} - *${mk.nama}* (${mk.kode}), ${namaHari(mk.hari)} ${mk.jam} di ${mk.ruangan}`;
        }
    });

    return text.trim();
};

const pjPerKelasText = (kelasNama = null) => {
    refreshPjFromFile();
    const pjContacts = loadPjContacts();
    const entries = kelasNama
        ? [[kelasNama, data.kelas[kelasNama]]]
        : Object.entries(data.kelas);

    if (kelasNama && !data.kelas[kelasNama]) {
        return `Kelas ${kelasNama} belum terdaftar.`;
    }

    let text = kelasNama
        ? `🧑‍💼 Daftar PJ per kelas - Kelas ${kelasNama}:`
        : '🧑‍💼 Daftar PJ per kelas:';
    let ada = false;

    for (const [kelasKey, kelasData] of entries) {
        const list = (kelasData?.matkul || []);
        if (!list.length) continue;

        ada = true;
        text += `\n\nKelas ${kelasKey}:`;
        list.forEach((mk, idx) => {
            const pjName = mk.pj || '-';
            const contact = mk.pj ? getPjContact(mk.pj, pjContacts) : null;
            const contactLabel = contact ? `*${contact}*` : '-';
            const pjLabel = pjName === '-' ? '-' : `*${pjName}*`;
            text += `\n${idx + 1}. *${mk.nama}* (${mk.kode})`;
            text += `\n   🧑‍💼 PJ   : ${pjLabel}`;
            text += `\n   📞 Nomor: ${contactLabel}`;
        });
    }

    if (!ada) {
        return kelasNama
            ? `Belum ada matkul untuk kelas ${kelasNama}.`
            : 'Belum ada matkul yang tercatat untuk kelas manapun.';
    }

    return text.trim();
};

const dosenPerKelasText = (kelasNama = null, dosenMap = {}) => {
    const entries = kelasNama
        ? [[kelasNama, data.kelas[kelasNama]]]
        : Object.entries(data.kelas);

    if (kelasNama && !data.kelas[kelasNama]) {
        return `Kelas ${kelasNama} belum terdaftar.`;
    }

    let text = kelasNama
        ? `👨‍🏫 Daftar dosen per kelas - Kelas ${kelasNama}:`
        : '👨‍🏫 Daftar dosen per kelas:';
    let ada = false;

    for (const [kelasKey, kelasData] of entries) {
        const list = (kelasData?.matkul || []);
        if (!list.length) continue;

        ada = true;
        text += `\n\nKelas ${kelasKey}:`;
        list.forEach((mk, idx) => {
            const dosenName = mk.dosen || '-';
            const telegram = mk.dosen ? getDosenTelegram(mk.dosen, dosenMap) : null;
            const telegramLabel = telegram ? `*${telegram}*` : '-';
            const dosenLabel = dosenName === '-' ? '-' : `*${dosenName}*`;
            text += `\n${idx + 1}. *${mk.nama}* (${mk.kode})`;
            text += `\n   👨‍🏫 Dosen: ${dosenLabel}`;
            text += `\n   📲 Telegram: ${telegramLabel}`;
        });
    }

    if (!ada) {
        return kelasNama
            ? `Belum ada matkul untuk kelas ${kelasNama}.`
            : 'Belum ada matkul yang tercatat untuk kelas manapun.';
    }

    return text.trim();
};

const dosenBesokText = (namaDosen, dosenMap) => {
    const hariIni = hariSekarangKode();
    const hariBesok = (hariIni % 7) + 1;
    const queryTokens = normalizeDosenTokens(namaDosen);
    if (!queryTokens.length) {
        return 'Nama dosen tidak valid. Contoh: !dosenbesok harmon';
    }

    const allMatches = new Set();
    const tomorrowMatches = new Set();

    for (const kelasData of Object.values(data.kelas)) {
        for (const mk of kelasData.matkul || []) {
            if (!mk.dosen) continue;
            if (!isDosenQueryMatch(queryTokens, mk.dosen)) continue;
            allMatches.add(mk.dosen);
            if (mk.hari === hariBesok) {
                tomorrowMatches.add(mk.dosen);
            }
        }
    }

    const queryKey = queryTokens.join(' ');
    const exactMatch = (names) =>
        Array.from(names).find(
            (name) => normalizeDosenTokens(name).join(' ') === queryKey
        );

    let allowedNames = null;
    if (tomorrowMatches.size > 1) {
        const exact = exactMatch(tomorrowMatches);
        if (!exact) {
            return buildDosenAmbiguousText(namaDosen, Array.from(tomorrowMatches));
        }
        allowedNames = new Set([exact]);
    } else if (tomorrowMatches.size === 1) {
        allowedNames = new Set(tomorrowMatches);
    } else {
        if (allMatches.size === 0) {
            return `Dosen "${namaDosen}" tidak ditemukan.`;
        }
        if (allMatches.size > 1) {
            return buildDosenAmbiguousText(namaDosen, Array.from(allMatches));
        }
        return `Tidak ada jadwal mengajar besok untuk ${Array.from(allMatches)[0]}.`;
    }

    const displayName =
        allowedNames.size === 1 ? Array.from(allowedNames)[0] : namaDosen;
    let text = `🧑‍🏫 Pengingat dosen *${displayName}* - kuliah besok (${namaHari(
        hariBesok
    )})\n`;
    let ada = false;

    for (const [kelasNama, kelasData] of Object.entries(data.kelas)) {
        for (const mk of kelasData.matkul || []) {
            if (!mk.dosen || mk.hari !== hariBesok) continue;
            if (!allowedNames.has(mk.dosen)) continue;
            ada = true;
            const telegram = getDosenTelegram(mk.dosen, dosenMap);
            text += `\nKelas ${kelasNama} - *${mk.nama}* (${mk.kode})\n`;
            text += `  ⏰ Jam  : ${mk.jam}\n`;
            text += `  🏫 Ruang: ${mk.ruangan}\n`;
            text += `  🧑‍💼 PJ   : ${mk.pj || '-'}\n`;
            if (telegram) text += `  💬 Telegram: *${telegram}*\n`;

            const tugasMk = tugasAktifUntukMatkul(kelasData, mk);
            if (tugasMk.length) {
                text += '  Tugas terkait yang belum selesai:\n';
                for (const t of tugasMk) {
                    text += `   - *${t.namaTugas}* [${t.jenis}], deadline ${namaHari(
                        t.hariDeadline
                    )} minggu ke-${t.mingguKe}\n`;
                }
            } else {
                text += '  Tidak ada tugas terkait yang belum selesai.\n';
            }
        }
    }

    if (!ada) {
        return `Tidak ada jadwal mengajar besok untuk ${displayName}.`;
    }
    return text.trim();
};

const dosenAllText = (dosenMap) => {
    const dosenMapLocal = {};

    for (const [kelasNama, kelasData] of Object.entries(data.kelas)) {
        for (const mk of kelasData.matkul || []) {
            if (!mk.dosen) continue;
            const key = mk.dosen.toLowerCase();
            if (!dosenMapLocal[key]) {
                dosenMapLocal[key] = { nama: mk.dosen, list: [] };
            }
            dosenMapLocal[key].list.push({ kelasNama, mk });
        }
    }

    const keys = Object.keys(dosenMapLocal);
    if (!keys.length) {
        return 'Belum ada dosen yang terdaftar pada matkul manapun.';
    }

    let text = '🧑‍🏫 Daftar semua dosen & jadwal mengajar:\n';
    for (const key of keys) {
        const group = dosenMapLocal[key];
        const telegram = getDosenTelegram(group.nama, dosenMap);
        text += `\n*${group.nama}*:\n`;
        for (const { kelasNama, mk } of group.list) {
            text += `- Kelas ${kelasNama} - *${mk.nama}* (${mk.kode}), ${namaHari(
                mk.hari
            )} ${mk.jam} di ${mk.ruangan} (PJ: ${mk.pj || '-'})\n`;
        }
        text += `  📲 Telegram : ${telegram ? `*${telegram}*` : '-'}\n`;
    }

    return text.trim();
};

const archiveListText = (kelasNama = null) => {
    const archive = loadArchiveData();
    const filtered = kelasNama
        ? archive.filter((item) => item.kelas?.toLowerCase() === kelasNama.toLowerCase())
        : archive;

    if (!filtered.length) {
        return kelasNama
            ? `Tidak ada arsip untuk kelas ${kelasNama}.`
            : 'Arsip tugas masih kosong.';
    }

    let text = kelasNama
        ? `📦 Arsip tugas - Kelas ${kelasNama}:`
        : '📦 Arsip tugas:';

    filtered.forEach((t, idx) => {
        const dl = t.deadlineDate ? new Date(t.deadlineDate) : null;
        const deadlineStr = dl ? dl.toLocaleDateString('en-GB') : '-';
        text += `\n\n${idx + 1}. *${t.namaTugas}* (*${t.matkulTerkait}*)`;
        text += `\n   Kelas   : ${t.kelas || kelasNama || '-'}`;
        text += `\n   🗓️ Deadline: ${deadlineStr}`;
        text += `\n   📝 Jenis   : ${t.jenis || '-'}`;
        text += `\n   🧾 Deskripsi: ${t.deskripsi || '-'}`;
    });

    return text.trim();
};

const cekDataSummary = () => {
    const pjData = loadPjData();
    applyPjToClasses(pjData);
    saveData();

    const issues = [];

    for (const [kelasNama, kelasData] of Object.entries(data.kelas)) {
        const kodeSet = new Set();
        for (const mk of kelasData.matkul || []) {
            if (!mk.kode) issues.push(`Kelas ${kelasNama}: Matkul ${mk.nama} tidak punya kode.`);
            if (mk.kode) {
                const key = mk.kode.toLowerCase();
                if (kodeSet.has(key)) issues.push(`Kelas ${kelasNama}: Duplikasi kode matkul ${mk.kode}.`);
                kodeSet.add(key);
            }
            if (!mk.pj) issues.push(`Kelas ${kelasNama}: PJ kosong untuk matkul ${mk.nama}.`);
        }

        for (const t of kelasData.tugas || []) {
            const exists = (kelasData.matkul || []).some(
                (m) => m.kode === t.matkulTerkait || m.nama === t.matkulTerkait
            );
            if (!exists) {
                issues.push(`Kelas ${kelasNama}: Tugas ${t.namaTugas} referensi matkul ${t.matkulTerkait} tidak ditemukan.`);
            }
        }
    }

    if (!issues.length) return 'Data konsisten, tidak ditemukan masalah.';
    return 'Ditemukan potensi masalah:\n- ' + issues.join('\n- ');
};

const buildMenuText = () => buildMenuCategoryListText();

    const COMMAND_CATEGORY_MAP = {
        '!kelas': 'kelas',
        '!setkelas': 'kelas',
        '!jadwal': 'jadwal',
        '!jadwalb': 'jadwal',
        '!jadwalujian': 'jadwal',
        '!ringkas': 'jadwal',
        '!cari': 'jadwal',
        '!listmatkul': 'jadwal',
        '!tugasminggu': 'tugas',
        '!tugasbesok': 'tugas',
        '!tugaslewat': 'tugas',
        '!tugaslist': 'tugas',
        '!arsiplist': 'tugas',
    '!pj': 'pj',
    '!pjreminder': 'pj',
    '!pjsaya': 'pj',
    '!pjkelas': 'pj',
    '!pjall': 'pj',
    '!dosenall': 'dosen',
    '!dosenbesok': 'dosen',
    '!dosenkelas': 'dosen',
    '!addmatkul': 'admin',
    '!editmatkul': 'admin',
    '!delmatkul': 'admin',
    '!setminggu': 'admin',
    '!addtugas': 'admin',
    '!edittugas': 'admin',
    '!donetugas': 'admin',
    '!hapustugas': 'admin',
    '!arsiptugas': 'admin',
    '!arsiprestore': 'admin',
    '!cekdata': 'admin',
    '!sinkronpj': 'admin',
    '!settelegram': 'admin',
    '!setpjnomor': 'admin',
    '!setreminder': 'admin',
    '!snooze': 'admin',
    '!exportdata': 'admin',
    '!importdata': 'admin',
    '!auditlog': 'admin',
    '!broadcast': 'admin',
    '!bc': 'admin'
};

const handleAkademikCommand = async (msg, ctx) => {
    const pesan = (msg.body || '').trim();
    if (!pesan.startsWith('!')) return false;

    ensureLoaded();
    const dosenMap = loadDosenData();
    const [cmdRaw, ...rest] = pesan.split(' ');
    const cmd = cmdRaw.toLowerCase();
    const argText = rest.join(' ').trim();
    const rawArgText = pesan.slice(cmdRaw.length).trim();

    const isAdmin = !!ctx.isAdmin;
    const adminContacts = ctx.adminContacts || [];
    const getDefaultKelas = ctx.getDefaultKelas || (() => null);
    const setDefaultKelas = ctx.setDefaultKelas || (() => {});
    const getGroupSettings = ctx.getGroupSettings || (() => ({}));
    const updateGroupSettings = ctx.updateGroupSettings || (() => {});
    const chatId = ctx.chatId || msg.from || 'chat';
    const commandCategory = COMMAND_CATEGORY_MAP[cmd] || null;
    let trackedResult = false;

    const resolveKelas = (input) => {
        const kelasInput = input || getDefaultKelas();
        if (!kelasInput) return null;
        return findKelasKey(kelasInput);
    };

    const reply = async (text) => {
        await msg.reply(text);
        if (!trackedResult && commandCategory) {
            trackMenuResult(chatId, commandCategory);
            trackedResult = true;
        }
    };
    const replyStatus = async (text) => reply(wrapWithStatus(text, getDefaultKelas()));
    const logAdminAction = (action, details = {}) => {
        if (!isAdmin) return;
        appendAuditLog({
            ts: new Date().toISOString(),
            action,
            chatId,
            actorId: ctx.actorId || 'unknown',
            actorName: ctx.actorName || '',
            details
        });
    };

    const notAdminText = 'Perintah ini khusus admin.';

    switch (cmd) {
        case '!menu':
        case '!help': {
            const chatId = ctx.chatId || msg.from || 'chat';
            const navAction = normalizeMenuNavigation(argText);
            if (navAction === 'exit') {
                await reply(buildMenuCategoryListText());
                trackMenuList(chatId);
                return true;
            }
            if (navAction === 'back') {
                const view = goBackMenuView(chatId);
                if (view.type === 'detail') {
                    await reply(buildMenuCategoryDetailText(view.category, isAdmin));
                } else {
                    await reply(buildMenuCategoryListText());
                }
                return true;
            }
            if (argText) {
                const category = normalizeMenuCategory(argText);
                if (category) {
                    if (category === 'tutorial') {
                        await reply(buildTutorialCategoryListText());
                        trackTutorialList(chatId);
                        return true;
                    }
                    await reply(buildMenuCategoryDetailText(category, isAdmin));
                    trackMenuDetail(chatId, category);
                    return true;
                }
            }
            await reply(buildMenuCategoryListText());
            trackMenuList(chatId);
            return true;
        }
        case '!bantuan':
        case '!helpadmin':
        case '!support': {
            await reply(buildHelpText(adminContacts));
            return true;
        }
        case '!tutorial':
        case '!panduan':
        case '!guide': {
            await reply(buildTutorialCategoryListText());
            trackTutorialList(chatId);
            return true;
        }
        case '!kelas': {
            const kelas = getDefaultKelas();
            await reply(
                kelas
                    ? `Default kelas grup ini: ${kelas}. Admin bisa ubah dengan !setkelas.`
                    : 'Default kelas belum di-set. Admin gunakan !setkelas 2025A.'
            );
            return true;
        }
        case '!setkelas': {
            if (!isAdmin) {
                await reply(notAdminText);
                return true;
            }
            if (!argText) {
                await reply('Format: !setkelas KELAS (contoh: !setkelas 2025A)');
                return true;
            }
            const kelasKey = findKelasKey(argText);
            if (!data.kelas[kelasKey]) {
                await reply(`Kelas ${argText} belum terdaftar. Tetap diset sebagai default.`);
            }
            setDefaultKelas(kelasKey);
            await reply(`Default kelas grup di-set ke ${kelasKey} (khusus grup ini).`);
            logAdminAction('setkelas', { kelas: kelasKey });
            return true;
        }
        case '!auditlog': {
            if (!isAdmin) {
                await reply(notAdminText);
                return true;
            }
            let limit = 10;
            if (argText) {
                const requested = Number(argText.split(' ')[0]);
                if (!Number.isInteger(requested) || requested < 1 || requested > 50) {
                    await reply('Format: !auditlog [jumlah 1-50]');
                    return true;
                }
                limit = requested;
            }
            const entries = readAuditLogEntries(limit, chatId);
            await reply(buildAuditLogText(entries));
            return true;
        }
        case '!broadcast':
        case '!bc': {
            if (!isAdmin) {
                await reply(notAdminText);
                return true;
            }
            const messageText = rawArgText;
            if (!messageText) {
                await reply('Format: !broadcast PESAN');
                return true;
            }
            const client = ctx.client || msg.client || null;
            let groupChat = ctx.chat || null;
            if (!groupChat && client && chatId && chatId.endsWith('@g.us')) {
                try {
                    groupChat = await client.getChatById(chatId);
                } catch (err) {
                    groupChat = null;
                }
            }
            if (!groupChat || !groupChat.isGroup) {
                await reply('Perintah ini hanya bisa dipakai di grup.');
                return true;
            }
            if (!client) {
                await reply('Broadcast gagal: client belum siap.');
                return true;
            }

            const participants = Array.isArray(groupChat.participants)
                ? groupChat.participants
                : [];
            const botId =
                client.info?.wid?._serialized ||
                (client.info?.wid?.user ? `${client.info.wid.user}@c.us` : null);
            const recipients = [
                ...new Set(
                    participants
                        .map((p) => (p && p.id ? p.id._serialized : null))
                        .filter((id) => id && id !== botId)
                )
            ];

            if (!recipients.length) {
                await reply('Tidak ada peserta grup untuk broadcast.');
                return true;
            }

            await reply(
                `Broadcast dimulai ke ${recipients.length} peserta. Pesan akan dikirim via chat pribadi.`
            );

            const sendDirect = wrapSend(client.sendMessage.bind(client));
            let sent = 0;
            let failed = 0;
            for (const recipientId of recipients) {
                try {
                    await sendDirect(recipientId, messageText);
                    sent += 1;
                } catch (err) {
                    failed += 1;
                }
            }
            const failText = failed ? ` (gagal ${failed})` : '';
            await reply(`Broadcast selesai. Terkirim ${sent}/${recipients.length}${failText}.`);
            logAdminAction('broadcast', { total: recipients.length, sent, failed });
            return true;
        }
        case '!cari': {
            if (!argText) {
                await reply(
                    'Format: !cari dosen NAMADOSEN | !cari jadwal NAMAMATKUL\nContoh: !cari dosen ike'
                );
                return true;
            }
            const nav = normalizeSearchNav(argText);
            if (nav) {
                const state = getSearchState(chatId);
                if (!state) {
                    await reply('Belum ada hasil pencarian. Gunakan !cari dosen/jadwal.');
                    return true;
                }
                const totalPages = Math.max(
                    1,
                    Math.ceil(state.results.length / SEARCH_PAGE_SIZE)
                );
                const nextPage = nav === 'next' ? state.page + 1 : state.page - 1;
                state.page = Math.min(Math.max(nextPage, 1), totalPages);
                updateSearchState(chatId, state);
                await replyStatus(buildSearchText(state));
                return true;
            }

            const parts = argText.split(' ').filter(Boolean);
            const type = normalizeSearchType(parts[0]);
            const query = parts.slice(1).join(' ').trim();
            if (!type || !query) {
                await reply(
                    'Format: !cari dosen NAMADOSEN | !cari jadwal NAMAMATKUL'
                );
                return true;
            }

            const results = buildSearchResults(type, query);
            const state = { type, query, results, page: 1 };
            updateSearchState(chatId, state);
            await replyStatus(buildSearchText(state));
            return true;
        }
        case '!jadwal': {
            const kelasKey = resolveKelas(argText);
            if (kelasKey) {
                await replyStatus(jadwalSemuaText(kelasKey));
            } else {
                await replyStatus(jadwalSemuaKelasText());
            }
            return true;
        }
        case '!jadwalb': {
            const kelasKey = resolveKelas(argText);
            if (kelasKey) {
                await replyStatus(jadwalBesokText(kelasKey));
            } else {
                await replyStatus(jadwalBesokAllText());
            }
            return true;
        }
        case '!ringkas': {
            const mode = (argText || '').toLowerCase();
            const kelasKey = resolveKelas();
            if (!mode || mode === 'hari' || mode === 'harian') {
                await replyStatus(ringkasanHarianText(kelasKey));
                return true;
            }
            if (mode === 'pekan' || mode === 'minggu' || mode === 'weekly') {
                await replyStatus(ringkasanPekanText(kelasKey));
                return true;
            }
            await reply('Format: !ringkas [hari|pekan]');
            return true;
        }
        case '!tugasminggu': {
            const kelasKey = resolveKelas(argText);
            if (kelasKey) {
                await replyStatus(tugasMingguIniText(kelasKey));
            } else {
                await replyStatus(tugasMingguIniAllText());
            }
            return true;
        }
        case '!tugasbesok': {
            const kelasKey = resolveKelas(argText);
            if (kelasKey) {
                await replyStatus(tugasBesokText(kelasKey));
            } else {
                await replyStatus(tugasBesokAllText());
            }
            return true;
        }
        case '!tugaslewat': {
            const kelasKey = resolveKelas(argText);
            if (kelasKey) {
                await replyStatus(tugasOverdueText(kelasKey));
            } else {
                await replyStatus(tugasOverdueAllText());
            }
            return true;
        }
        case '!tugaslist': {
            const kelasKey = resolveKelas(argText);
            if (kelasKey) {
                await replyStatus(tugasListText(kelasKey));
            } else {
                await replyStatus(tugasListAllText());
            }
            return true;
        }
        case '!jadwalujian': {
            const navAction = normalizeMenuNavigation(argText);
            if (navAction === 'exit') {
                await reply(buildMenuCategoryListText());
                trackMenuList(chatId);
                return true;
            }
            if (navAction === 'back') {
                await reply(buildMenuCategoryDetailText('jadwal', isAdmin));
                trackMenuDetail(chatId, 'jadwal');
                return true;
            }
            const category = normalizeJadwalUjianCategory(argText);
            if (category) {
                await replyStatus(buildJadwalUjianDetailText(category));
                return true;
            }
            await replyStatus(buildJadwalUjianMenuText());
            return true;
        }
        case '!pj': {
            if (!argText) {
                await reply('Format: !pj KELAS NAMAPJ');
                return true;
            }
            let kelasName = null;
            let namaPJ = null;
            if (argText.includes('|')) {
                const parts = argText.split('|').map((p) => p.trim()).filter(Boolean);
                kelasName = parts[0];
                namaPJ = parts.slice(1).join(' ');
            } else {
                const tokens = argText.split(' ').filter(Boolean);
                if (tokens.length >= 2) {
                    kelasName = tokens.shift();
                    namaPJ = tokens.join(' ');
                } else {
                    kelasName = getDefaultKelas();
                    namaPJ = tokens[0];
                }
            }
            if (!kelasName || !namaPJ) {
                await reply('Format: !pj KELAS NAMAPJ');
                return true;
            }
            const kelasKey = findKelasKey(kelasName);
            await replyStatus(pjMatkulText(kelasKey, namaPJ));
            return true;
        }
        case '!pjreminder':
            if (!argText) {
                await reply('Format: !pjreminder NAMAPJ');
                return true;
            }
            await replyStatus(pjReminderBesokText(argText));
            return true;
        case '!pjsaya':
            if (!argText) {
                await reply('Format: !pjsaya NAMAPJ');
                return true;
            }
            await replyStatus(pjsayaText(argText));
            return true;
        case '!pjkelas': {
            const input = argText.trim();
            if (!input) {
                await replyStatus(pjPerKelasText(null));
                return true;
            }
            const cleaned = input.toLowerCase();
            if (cleaned === 'all' || cleaned === 'semua') {
                await replyStatus(pjPerKelasText(null));
                return true;
            }
            const kelasKey = findKelasKey(input);
            await replyStatus(pjPerKelasText(kelasKey));
            return true;
        }
        case '!pjall':
            await replyStatus(pjAllText());
            return true;
        case '!dosenall':
            await replyStatus(dosenAllText(dosenMap));
            return true;
        case '!dosenbesok':
            if (!argText) {
                await reply('Format: !dosenbesok NAMADOSEN');
                return true;
            }
            await replyStatus(dosenBesokText(argText, dosenMap));
            return true;
        case '!dosenkelas': {
            const input = argText.trim();
            if (!input) {
                await replyStatus(dosenPerKelasText(null, dosenMap));
                return true;
            }
            const cleaned = input.toLowerCase();
            if (cleaned === 'all' || cleaned === 'semua') {
                await replyStatus(dosenPerKelasText(null, dosenMap));
                return true;
            }
            const kelasKey = findKelasKey(input);
            await replyStatus(dosenPerKelasText(kelasKey, dosenMap));
            return true;
        }
        case '!settelegram': {
            if (!isAdmin) {
                await reply(notAdminText);
                return true;
            }
            const parts = argText.split('|').map((p) => p.trim()).filter(Boolean);
            if (parts.length < 2) {
                await reply('Format: !settelegram NAMADOSEN | @telegram');
                return true;
            }
            const namaDosen = parts[0];
            const telegram = parts.slice(1).join(' ');
            if (!namaDosen || !telegram) {
                await reply('Format: !settelegram NAMADOSEN | @telegram');
                return true;
            }
            dosenMap[namaDosen.toLowerCase()] = telegram;
            saveDosenData(dosenMap);
            await reply(`Telegram dosen ${namaDosen} diset ke ${telegram}.`);
            logAdminAction('settelegram', { dosen: namaDosen, telegram });
            return true;
        }
        case '!setpjnomor': {
            if (!isAdmin) {
                await reply(notAdminText);
                return true;
            }
            const parts = argText.split('|').map((p) => p.trim()).filter(Boolean);
            if (parts.length < 2) {
                await reply('Format: !setpjnomor NAMAPJ | 08xxxxxxxxxx');
                return true;
            }
            const namaPJ = parts[0];
            const nomor = parts.slice(1).join(' ');
            if (!namaPJ || !nomor) {
                await reply('Format: !setpjnomor NAMAPJ | 08xxxxxxxxxx');
                return true;
            }
            const pjContacts = loadPjContacts();
            pjContacts[namaPJ.toLowerCase()] = nomor;
            savePjContacts(pjContacts);
            await reply(`Nomor PJ ${namaPJ} diset ke ${nomor}.`);
            logAdminAction('setpjnomor', { pj: namaPJ, nomor });
            return true;
        }
        case '!setreminder': {
            if (!isAdmin) {
                await reply(notAdminText);
                return true;
            }
            const settings = getGroupSettings();
            if (!argText) {
                const current = Array.isArray(settings.reminderRules)
                    ? settings.reminderRules
                    : [];
                const currentLabel = current.length
                    ? current.map((k) => REMINDER_RULE_LABELS[k] || k).join(', ')
                    : 'default';
                await reply(
                    `Format: !setreminder 3d,1d,6h\nSaat ini: ${currentLabel}`
                );
                return true;
            }
            const input = argText.toLowerCase();
            if (input === 'default' || input === 'reset') {
                updateGroupSettings({ reminderRules: null });
                await reply('Reminder grup direset ke default.');
                logAdminAction('setreminder', { mode: 'default' });
                return true;
            }
            const keys = parseReminderRuleTokens(argText);
            if (!keys.length) {
                await reply(
                    `Format: !setreminder 3d,1d,6h\nOpsi: ${REMINDER_RULE_KEYS.join(', ')}`
                );
                return true;
            }
            updateGroupSettings({ reminderRules: keys });
            await reply(
                `Reminder grup diset ke: ${keys
                    .map((k) => REMINDER_RULE_LABELS[k] || k)
                    .join(', ')}`
            );
            logAdminAction('setreminder', { rules: keys });
            return true;
        }
        case '!snooze': {
            if (!isAdmin) {
                await reply(notAdminText);
                return true;
            }
            if (!argText) {
                await reply('Format: !snooze 1h|2h|3h|off');
                return true;
            }
            const input = argText.toLowerCase().trim();
            if (input === 'off' || input === 'reset') {
                updateGroupSettings({ reminderSnoozeUntil: null });
                await reply('Snooze reminder dimatikan.');
                logAdminAction('snooze', { mode: 'off' });
                return true;
            }
            const match = input.match(/(\d+)\s*h/);
            const hours = match ? Number(match[1]) : NaN;
            if (!Number.isInteger(hours) || hours < 1 || hours > 3) {
                await reply('Durasi snooze harus 1-3 jam. Contoh: !snooze 2h');
                return true;
            }
            const until = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
            updateGroupSettings({ reminderSnoozeUntil: until });
            await reply(`Reminder disnooze selama ${hours} jam.`);
            logAdminAction('snooze', { hours, until });
            return true;
        }
        case '!exportdata': {
            if (!isAdmin) {
                await reply(notAdminText);
                return true;
            }
            const labelRaw = argText.trim();
            const label = labelRaw ? labelRaw.replace(/[^\w-]/g, '').trim() : '';
            const payload = buildExportPayload();
            const filePath = writeExportFile(payload, label || null);
            const relativePath = path.relative(path.join(__dirname, '..'), filePath);
            await reply(`Export data selesai.\nFile: ${relativePath}`);
            logAdminAction('exportdata', { file: relativePath, label: label || null });
            return true;
        }
        case '!importdata': {
            if (!isAdmin) {
                await reply(notAdminText);
                return true;
            }
            if (!argText) {
                await reply('Format: !importdata latest | NAMA_FILE.json');
                return true;
            }
            const targetPath = resolveImportPath(argText.trim());
            if (!targetPath) {
                await reply('File import tidak ditemukan. Simpan file di akademik/exports atau gunakan latest.');
                return true;
            }
            let payload;
            try {
                payload = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
            } catch (e) {
                await reply('File import tidak valid (JSON).');
                return true;
            }
            importDataPayload(payload);
            loadData();
            const relativePath = path.relative(path.join(__dirname, '..'), targetPath);
            await reply(`Import data selesai dari ${relativePath}.`);
            logAdminAction('importdata', { file: relativePath });
            return true;
        }
        case '!listmatkul': {
            const kelasKey = resolveKelas(argText);
            if (!kelasKey) {
                await reply('Format: !listmatkul KELAS');
                return true;
            }
            await replyStatus(listMatkulText(kelasKey));
            return true;
        }
        case '!addmatkul': {
            if (!isAdmin) {
                await reply(notAdminText);
                return true;
            }
            const parts = argText.split('|').map((p) => p.trim()).filter(Boolean);
            if (parts.length < 7) {
                await reply('Format: !addmatkul KELAS | NAMA | KODE | DOSEN | HARI(1-7) | JAM | RUANGAN | PJ');
                return true;
            }
            const [kelasNama, nama, kode, dosen, hariStr, jam, ruangan, pj] = parts;
            const hari = Number(hariStr);
            if (!Number.isInteger(hari) || hari < 1 || hari > 7) {
                await reply('HARI harus angka 1-7 (1=Senin ... 7=Minggu).');
                return true;
            }
            const kelasData = getOrCreateKelas(kelasNama);
            kelasData.matkul.push({ nama, kode, dosen, hari, jam, ruangan, pj: pj || '' });
            saveData();
            await reply(`Matkul ${nama} (${kode}) berhasil ditambahkan ke kelas ${kelasNama}.`);
            logAdminAction('addmatkul', { kelas: kelasNama, nama, kode, dosen, hari, jam, ruangan, pj: pj || '' });
            return true;
        }
        case '!editmatkul': {
            if (!isAdmin) {
                await reply(notAdminText);
                return true;
            }
            if (!argText) {
                await reply('Format: !editmatkul KELAS INDEX | NAMA | KODE | DOSEN | HARI | JAM | RUANGAN | PJ');
                return true;
            }
            const parts = argText.split('|').map((p) => p.trim()).filter(Boolean);
            const head = parts.shift() || '';
            const headTokens = head.split(' ').filter(Boolean);
            if (headTokens.length < 2 || parts.length < 7) {
                await reply('Format: !editmatkul KELAS INDEX | NAMA | KODE | DOSEN | HARI | JAM | RUANGAN | PJ');
                return true;
            }
            const kelasNama = headTokens[0];
            const indexStr = headTokens[1];
            const idx = Number(indexStr) - 1;
            const kelasKey = findKelasKey(kelasNama);
            const kelasData = data.kelas[kelasKey];
            if (!kelasData || idx < 0 || idx >= kelasData.matkul.length) {
                await reply('KELAS atau INDEX matkul tidak valid.');
                return true;
            }
            const [nama, kode, dosen, hariStr, jam, ruangan, pj] = parts;
            const hari = Number(hariStr);
            if (!Number.isInteger(hari) || hari < 1 || hari > 7) {
                await reply('HARI harus angka 1-7.');
                return true;
            }
            const mk = kelasData.matkul[idx];
            mk.nama = nama;
            mk.kode = kode;
            mk.dosen = dosen;
            mk.hari = hari;
            mk.jam = jam;
            mk.ruangan = ruangan;
            mk.pj = pj || '';
            saveData();
            await reply(`Matkul index ${idx + 1} di kelas ${kelasNama} berhasil diperbarui.`);
            logAdminAction('editmatkul', {
                kelas: kelasNama,
                index: idx + 1,
                nama,
                kode,
                dosen,
                hari,
                jam,
                ruangan,
                pj: pj || ''
            });
            return true;
        }
        case '!delmatkul': {
            if (!isAdmin) {
                await reply(notAdminText);
                return true;
            }
            const tokens = argText.split(' ').filter(Boolean);
            const kelasNama = tokens[0];
            const indexStr = tokens[1];
            if (!kelasNama || !indexStr) {
                await reply('Format: !delmatkul KELAS INDEX');
                return true;
            }
            const kelasKey = findKelasKey(kelasNama);
            const kelasData = data.kelas[kelasKey];
            const idx = Number(indexStr) - 1;
            if (!kelasData || idx < 0 || idx >= kelasData.matkul.length) {
                await reply('KELAS atau INDEX matkul tidak valid.');
                return true;
            }
            const removed = kelasData.matkul.splice(idx, 1)[0];
            saveData();
            await reply(`Matkul ${removed.nama} (${removed.kode}) di kelas ${kelasNama} telah dihapus.`);
            logAdminAction('delmatkul', {
                kelas: kelasNama,
                nama: removed.nama,
                kode: removed.kode,
                index: idx + 1
            });
            return true;
        }
        case '!setminggu': {
            if (!isAdmin) {
                await reply(notAdminText);
                return true;
            }
            const n = Number(argText);
            if (!Number.isInteger(n) || n < 1 || n > 30) {
                await reply('Minggu harus angka 1-30.');
                return true;
            }
            currentWeek = n;
            saveData();
            await reply(`Minggu akademik sekarang di-set ke ${currentWeek}.`);
            logAdminAction('setminggu', { minggu: currentWeek });
            return true;
        }
        case '!addtugas': {
            if (!isAdmin) {
                await reply(notAdminText);
                return true;
            }
            const parts = argText.split('|').map((p) => p.trim()).filter(Boolean);
            if (parts.length < 5) {
                await reply('Format: !addtugas KELAS | KODE/NAMA | NAMA TUGAS | JENIS | MINGGU/TANGGAL | HARI | PENGUMPULAN | DESKRIPSI');
                return true;
            }
            const [kelasNama, kodeAtauNama, namaTugas, jenis, mingguAtauTanggal, ...restParts] = parts;
            const kelasKey = findKelasKey(kelasNama);
            const kelasData = getOrCreateKelas(kelasKey);
            const mk = kelasData.matkul.find(
                (m) => m.kode === kodeAtauNama || m.nama === kodeAtauNama
            );
            if (!mk) {
                await reply(`Matkul dengan kode/nama ${kodeAtauNama} tidak ditemukan di kelas ${kelasNama}.`);
                return true;
            }

            let mingguKe = null;
            let hariDeadline = null;
            let deadlineDate = null;
            let pengumpulan = '';
            let deskripsi = '';

            if (mingguAtauTanggal && mingguAtauTanggal.includes('/')) {
                const parsed = parseDeadlineDate(mingguAtauTanggal);
                if (!parsed) {
                    await reply('Format tanggal harus DD/MM/YY.');
                    return true;
                }
                deadlineDate = parsed.toISOString();
                hariDeadline = parsed.getUTCDay() === 0 ? 7 : parsed.getUTCDay();
                mingguKe = currentWeek;
                if (restParts.length >= 2) {
                    pengumpulan = restParts[0];
                    deskripsi = restParts.slice(1).join(' ').trim();
                } else {
                    deskripsi = restParts.join(' ').trim();
                }
            } else {
                const hariStr = restParts.shift();
                if (!hariStr) {
                    await reply('Format: !addtugas KELAS | KODE/NAMA | NAMA TUGAS | JENIS | MINGGU/TANGGAL | HARI | PENGUMPULAN | DESKRIPSI');
                    return true;
                }
                mingguKe = Number(mingguAtauTanggal);
                hariDeadline = Number(hariStr);
                if (!Number.isInteger(mingguKe) || mingguKe < 1 || mingguKe > 30) {
                    await reply('MINGGU harus angka 1-30.');
                    return true;
                }
                if (!Number.isInteger(hariDeadline) || hariDeadline < 1 || hariDeadline > 7) {
                    await reply('HARI harus angka 1-7.');
                    return true;
                }
                if (restParts.length >= 2) {
                    pengumpulan = restParts[0];
                    deskripsi = restParts.slice(1).join(' ').trim();
                } else {
                    deskripsi = restParts.join(' ').trim();
                }
            }

            kelasData.tugas.push({
                namaTugas,
                matkulTerkait: mk.kode,
                deskripsi,
                pengumpulan,
                jenis,
                mingguKe,
                hariDeadline,
                deadlineDate,
                selesai: false
            });
            saveData();
            await reply(`Tugas ${namaTugas} untuk matkul ${mk.nama} (${mk.kode}) di kelas ${kelasNama} berhasil ditambahkan.`);
            logAdminAction('addtugas', {
                kelas: kelasNama,
                namaTugas,
                matkul: mk.nama,
                kode: mk.kode,
                jenis,
                mingguKe,
                hariDeadline,
                deadlineDate,
                pengumpulan
            });
            return true;
        }
        case '!edittugas': {
            if (!isAdmin) {
                await reply(notAdminText);
                return true;
            }
            const parts = argText.split('|').map((p) => p.trim()).filter(Boolean);
            const head = parts.shift() || '';
            const headTokens = head.split(' ').filter(Boolean);
            if (headTokens.length < 2 || parts.length < 5) {
                await reply('Format: !edittugas KELAS INDEX | KODE/NAMA | NAMA TUGAS | JENIS | MINGGU/TANGGAL | HARI | PENGUMPULAN | DESKRIPSI');
                return true;
            }
            const kelasNama = headTokens[0];
            const indexStr = headTokens[1];
            const idx = Number(indexStr) - 1;
            const kelasKey = findKelasKey(kelasNama);
            const kelasData = data.kelas[kelasKey];
            if (!kelasData || idx < 0 || idx >= kelasData.tugas.length) {
                await reply('KELAS atau INDEX tugas tidak valid.');
                return true;
            }
            const [kodeAtauNama, namaTugas, jenis, mingguAtauTanggal, ...restParts] = parts;
            const mk = kelasData.matkul.find(
                (m) => m.kode === kodeAtauNama || m.nama === kodeAtauNama
            );
            if (!mk) {
                await reply(`Matkul dengan kode/nama ${kodeAtauNama} tidak ditemukan di kelas ${kelasNama}.`);
                return true;
            }

            let mingguKe = null;
            let hariDeadline = null;
            let deadlineDate = null;
            let pengumpulan = '';
            let deskripsi = '';

            if (mingguAtauTanggal && mingguAtauTanggal.includes('/')) {
                const parsed = parseDeadlineDate(mingguAtauTanggal);
                if (!parsed) {
                    await reply('Format tanggal harus DD/MM/YY.');
                    return true;
                }
                deadlineDate = parsed.toISOString();
                hariDeadline = parsed.getUTCDay() === 0 ? 7 : parsed.getUTCDay();
                mingguKe = currentWeek;
                if (restParts.length >= 2) {
                    pengumpulan = restParts[0];
                    deskripsi = restParts.slice(1).join(' ').trim();
                } else {
                    deskripsi = restParts.join(' ').trim();
                }
            } else {
                const hariStr = restParts.shift();
                if (!hariStr) {
                    await reply('Format: !edittugas KELAS INDEX | KODE/NAMA | NAMA TUGAS | JENIS | MINGGU/TANGGAL | HARI | PENGUMPULAN | DESKRIPSI');
                    return true;
                }
                mingguKe = Number(mingguAtauTanggal);
                hariDeadline = Number(hariStr);
                if (!Number.isInteger(mingguKe) || mingguKe < 1 || mingguKe > 30) {
                    await reply('MINGGU harus angka 1-30.');
                    return true;
                }
                if (!Number.isInteger(hariDeadline) || hariDeadline < 1 || hariDeadline > 7) {
                    await reply('HARI harus angka 1-7.');
                    return true;
                }
                if (restParts.length >= 2) {
                    pengumpulan = restParts[0];
                    deskripsi = restParts.slice(1).join(' ').trim();
                } else {
                    deskripsi = restParts.join(' ').trim();
                }
            }

            const t = kelasData.tugas[idx];
            t.matkulTerkait = mk.kode;
            t.namaTugas = namaTugas;
            t.jenis = jenis;
            t.mingguKe = mingguKe;
            t.hariDeadline = hariDeadline;
            t.deadlineDate = deadlineDate;
            t.pengumpulan = pengumpulan;
            t.deskripsi = deskripsi;
            saveData();
            await reply(`Tugas index ${idx + 1} di kelas ${kelasNama} berhasil diperbarui.`);
            logAdminAction('edittugas', {
                kelas: kelasNama,
                index: idx + 1,
                namaTugas,
                matkul: mk.nama,
                kode: mk.kode,
                jenis,
                mingguKe,
                hariDeadline,
                deadlineDate,
                pengumpulan
            });
            return true;
        }
        case '!donetugas': {
            if (!isAdmin) {
                await reply(notAdminText);
                return true;
            }
            const tokens = argText.split(' ').filter(Boolean);
            const kelasNama = tokens[0];
            const idxStr = tokens[1];
            if (!kelasNama || !idxStr) {
                await reply('Format: !donetugas KELAS INDEX');
                return true;
            }
            const kelasKey = findKelasKey(kelasNama);
            const kelasData = data.kelas[kelasKey];
            const idx = Number(idxStr) - 1;
            if (!kelasData || idx < 0 || idx >= kelasData.tugas.length) {
                await reply('KELAS atau INDEX tugas tidak valid.');
                return true;
            }
            const t = kelasData.tugas[idx];
            t.selesai = true;
            saveData();
            await reply(`Tugas index ${idx + 1} (${t.namaTugas}) di kelas ${kelasNama} ditandai selesai.`);
            logAdminAction('donetugas', {
                kelas: kelasNama,
                index: idx + 1,
                namaTugas: t.namaTugas
            });
            return true;
        }
        case '!hapustugas': {
            if (!isAdmin) {
                await reply(notAdminText);
                return true;
            }
            const tokens = argText.split(' ').filter(Boolean);
            const kelasNama = tokens[0];
            const idxStr = tokens[1];
            if (!kelasNama || !idxStr) {
                await reply('Format: !hapustugas KELAS INDEX');
                return true;
            }
            const kelasKey = findKelasKey(kelasNama);
            const kelasData = data.kelas[kelasKey];
            const idx = Number(idxStr) - 1;
            if (!kelasData || idx < 0 || idx >= kelasData.tugas.length) {
                await reply('KELAS atau INDEX tugas tidak valid.');
                return true;
            }
            const removed = kelasData.tugas.splice(idx, 1)[0];
            saveData();
            await reply(`Tugas ${removed.namaTugas} di kelas ${kelasNama} telah dihapus.`);
            logAdminAction('hapustugas', {
                kelas: kelasNama,
                index: idx + 1,
                namaTugas: removed.namaTugas
            });
            return true;
        }
        case '!arsiptugas': {
            if (!isAdmin) {
                await reply(notAdminText);
                return true;
            }
            const tokens = argText.split(' ').filter(Boolean);
            const kelasNama = tokens[0];
            const idxStr = tokens[1];
            if (!kelasNama || !idxStr) {
                await reply('Format: !arsiptugas KELAS INDEX');
                return true;
            }
            const kelasKey = findKelasKey(kelasNama);
            const kelasData = data.kelas[kelasKey];
            const idx = Number(idxStr) - 1;
            if (!kelasData || idx < 0 || idx >= kelasData.tugas.length) {
                await reply('KELAS atau INDEX tugas tidak valid.');
                return true;
            }
            const removed = kelasData.tugas.splice(idx, 1)[0];
            const archive = loadArchiveData();
            archive.push({
                ...removed,
                kelas: kelasNama,
                archivedAt: new Date().toISOString()
            });
            saveArchiveData(archive);
            saveData();
            await reply(`Tugas ${removed.namaTugas} di kelas ${kelasNama} telah diarsipkan.`);
            logAdminAction('arsiptugas', {
                kelas: kelasNama,
                index: idx + 1,
                namaTugas: removed.namaTugas
            });
            return true;
        }
        case '!arsiplist': {
            if (!isAdmin) {
                await reply(notAdminText);
                return true;
            }
            const kelasKey = argText ? findKelasKey(argText) : null;
            await replyStatus(archiveListText(kelasKey));
            return true;
        }
        case '!arsiprestore': {
            if (!isAdmin) {
                await reply(notAdminText);
                return true;
            }
            const tokens = argText.split(' ').filter(Boolean);
            const kelasNama = tokens[0];
            const idxStr = tokens[1];
            if (!kelasNama || !idxStr) {
                await reply('Format: !arsiprestore KELAS INDEX');
                return true;
            }
            const archive = loadArchiveData();
            const filtered = archive.filter(
                (item) => item.kelas?.toLowerCase() === kelasNama.toLowerCase()
            );
            if (!filtered.length) {
                await reply(`Tidak ada arsip untuk kelas ${kelasNama}.`);
                return true;
            }
            const idx = Number(idxStr) - 1;
            if (idx < 0 || idx >= filtered.length) {
                await reply('INDEX tidak valid untuk kelas tersebut.');
                return true;
            }
            const target = filtered[idx];
            const removeIdx = archive.indexOf(target);
            if (removeIdx >= 0) archive.splice(removeIdx, 1);
            const kelasData = getOrCreateKelas(kelasNama);
            kelasData.tugas.push({
                namaTugas: target.namaTugas,
                matkulTerkait: target.matkulTerkait,
                deskripsi: target.deskripsi || '',
                pengumpulan:
                    target.pengumpulan ||
                    target.tempatPengumpulan ||
                    target.tempatKumpul ||
                    '',
                jenis: target.jenis || '',
                mingguKe: target.mingguKe || currentWeek,
                hariDeadline: target.hariDeadline || 1,
                deadlineDate: target.deadlineDate || null,
                selesai: !!target.selesai
            });
            saveArchiveData(archive);
            saveData();
            await reply(`Tugas ${target.namaTugas} telah dikembalikan ke kelas ${kelasNama}.`);
            logAdminAction('arsiprestore', {
                kelas: kelasNama,
                index: idx + 1,
                namaTugas: target.namaTugas
            });
            return true;
        }
        case '!cekdata': {
            if (!isAdmin) {
                await reply(notAdminText);
                return true;
            }
            await reply(cekDataSummary());
            return true;
        }
        case '!sinkronpj': {
            if (!isAdmin) {
                await reply(notAdminText);
                return true;
            }
            const pjData = loadPjData();
            applyPjToClasses(pjData);
            saveData();
            await reply('PJ berhasil disinkronkan dari pj.json.');
            logAdminAction('sinkronpj', { source: 'pj.json' });
            return true;
        }
        default:
            return false;
    }
};

const handleJadwalUjianSelection = async (
    msg,
    quotedMsg,
    isAdmin,
    chatId,
    defaultKelas = null
) => {
    if (!quotedMsg || !quotedMsg.fromMe) return false;
    const quotedBody = quotedMsg.body || '';
    const isMenu = isJadwalUjianMenuText(quotedBody);
    const isDetail = isJadwalUjianDetailText(quotedBody);
    if (!isMenu && !isDetail) return false;

    const input = (msg.body || '').trim();
    const navAction = normalizeMenuNavigation(input);
    const replyStatus = async (text) => msg.reply(wrapWithStatus(text, defaultKelas));

    if (navAction === 'exit') {
        await msg.reply(buildMenuCategoryListText());
        trackMenuList(chatId);
        return true;
    }

    if (navAction === 'back') {
        if (isDetail) {
            await replyStatus(buildJadwalUjianMenuText());
            return true;
        }
        await msg.reply(buildMenuCategoryDetailText('jadwal', isAdmin));
        trackMenuDetail(chatId, 'jadwal');
        return true;
    }

    if (!isMenu) return false;

    const category = normalizeJadwalUjianCategory(input);
    if (!category) {
        await replyStatus(buildJadwalUjianMenuText());
        return true;
    }

    await replyStatus(buildJadwalUjianDetailText(category));
    return true;
};

const listMatkulText = (kelasNama) => {
    const kelasData = data.kelas[kelasNama];
    if (!kelasData) return `Kelas ${kelasNama} belum terdaftar.`;
    if (kelasData.matkul.length === 0) return `Belum ada matkul untuk kelas ${kelasNama}.`;

    let text = `📚 Daftar matkul - Kelas ${kelasNama}:\n`;
    kelasData.matkul.forEach((m, idx) => {
        text += `\n${idx + 1}. *${m.nama}* (${m.kode})\n`;
        text += `   👨‍🏫 Dosen: *${m.dosen}*\n`;
        text += `   📅 Hari : ${namaHari(m.hari)}\n`;
        text += `   ⏰ Jam  : ${m.jam}\n`;
        text += `   🏫 Ruang: ${m.ruangan}\n`;
        text += `   🧑‍💼 PJ   : ${m.pj || '-'}\n`;
    });
    return text.trim();
};

module.exports = { handleAkademikCommand, handleJadwalUjianSelection };

