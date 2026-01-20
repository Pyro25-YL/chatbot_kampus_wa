const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { bacaData, simpanData } = require('./database');
const { enqueueSend } = require('./send_queue');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const CRON_INTERVAL_MINUTES = 5;
const REMINDER_WINDOW_MS = CRON_INTERVAL_MINUTES * 60 * 1000;

const REMINDER_RULES = [
    { key: '1w', label: '1 minggu', ms: 7 * 24 * 60 * 60 * 1000 },
    { key: '5d', label: '5 hari', ms: 5 * 24 * 60 * 60 * 1000 },
    { key: '3d', label: '3 hari', ms: 3 * 24 * 60 * 60 * 1000 },
    { key: '1d', label: '1 hari', ms: 24 * 60 * 60 * 1000 },
    { key: '12h', label: '12 jam', ms: 12 * 60 * 60 * 1000 },
    { key: '6h', label: '6 jam', ms: 6 * 60 * 60 * 1000 },
    { key: '3h', label: '3 jam', ms: 3 * 60 * 60 * 1000 },
    { key: '1h', label: '1 jam', ms: 60 * 60 * 1000 },
    { key: '30m', label: '30 menit', ms: 30 * 60 * 1000 }
];
const REMINDER_RULE_MAP = new Map(REMINDER_RULES.map((rule) => [rule.key, rule]));

const GROUPS_FILE = path.join(__dirname, '..', 'akademik', 'groups.json');

const loadGroupSettings = () => {
    try {
        if (!fs.existsSync(GROUPS_FILE)) return {};
        return JSON.parse(fs.readFileSync(GROUPS_FILE, 'utf8'));
    } catch (e) {
        return {};
    }
};

const getGroupReminderRules = (groupSettings, groupId) => {
    const group = groupSettings[groupId];
    const keys = Array.isArray(group?.reminderRules) ? group.reminderRules : null;
    if (!keys || !keys.length) return REMINDER_RULES;
    const list = keys.map((key) => REMINDER_RULE_MAP.get(key)).filter(Boolean);
    return list.length ? list : REMINDER_RULES;
};

const ID_MONTHS = {
    januari: 0,
    februari: 1,
    maret: 2,
    april: 3,
    mei: 4,
    juni: 5,
    juli: 6,
    agustus: 7,
    september: 8,
    oktober: 9,
    november: 10,
    desember: 11,
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    jun: 5,
    jul: 6,
    agu: 7,
    sep: 8,
    okt: 9,
    nov: 10,
    des: 11
};

const parseDeadline = (value) => {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value === 'number') return new Date(value);
    if (typeof value !== 'string') return null;

    const trimmed = value.trim();
    if (!trimmed) return null;

    let parsed;
    let match = trimmed.match(
        /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2})[:.](\d{2}))?$/
    );
    if (match) {
        const [, y, m, d, h = '23', min = '59'] = match;
        parsed = new Date(
            Number(y),
            Number(m) - 1,
            Number(d),
            Number(h),
            Number(min),
            0,
            0
        );
        if (!Number.isNaN(parsed.getTime())) return parsed;
    }

    match = trimmed.match(
        /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2})[:.](\d{2}))?$/
    );
    if (match) {
        let [, d, m, y, h = '23', min = '59'] = match;
        let year = Number(y);
        if (year < 100) year += 2000;
        parsed = new Date(
            year,
            Number(m) - 1,
            Number(d),
            Number(h),
            Number(min),
            0,
            0
        );
        if (!Number.isNaN(parsed.getTime())) return parsed;
    }

    const lower = trimmed.toLowerCase();
    match = lower.match(
        /(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?(?:.*?(\d{1,2})[:.](\d{2}))?/
    );
    if (match) {
        const now = new Date();
        const day = Number(match[1]);
        const monthKey = match[2].replace(/[^a-z]/g, '');
        const yearRaw = match[3];
        const hour = match[4] ? Number(match[4]) : 23;
        const minute = match[5] ? Number(match[5]) : 59;
        const month = ID_MONTHS[monthKey];
        if (month !== undefined) {
            const year = yearRaw ? Number(yearRaw) : now.getFullYear();
            parsed = new Date(year, month, day, hour, minute, 0, 0);
            if (!yearRaw && parsed < now) {
                parsed = new Date(year + 1, month, day, hour, minute, 0, 0);
            }
            if (!Number.isNaN(parsed.getTime())) return parsed;
        }
    }

    parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) return parsed;

    return null;
};

const formatTimeLeft = (ms) => {
    if (ms <= 0) return 'lewat deadline';
    const totalMinutes = Math.max(1, Math.ceil(ms / 60000));
    const days = Math.floor(totalMinutes / (60 * 24));
    const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
    const minutes = totalMinutes % 60;
    const parts = [];
    if (days) parts.push(`${days} hari`);
    if (hours) parts.push(`${hours} jam`);
    if (!days && !hours) parts.push(`${minutes} menit`);
    else if (minutes && !days) parts.push(`${minutes} menit`);
    return parts.join(' ');
};

const buildReminderMessage = (task, rule, diffMs) => {
    const lines = [
        `⏰ Reminder Tugas (${rule.label} lagi)`,
        `📚 Matkul: *${task.matkul || '-'}*`,
        `🗓️ Deadline: ${task.deadline || '-'}`,
        `📝 Detail: ${task.detail || '-'}`
    ];

    if (task.tempat && task.tempat !== '-') {
        lines.push(`📍 Tempat: ${task.tempat}`);
    }
    if (task.format && task.format !== '-') {
        lines.push(`🗂️ Format: ${task.format}`);
    }

    lines.push(`⌛ Sisa: ${formatTimeLeft(diffMs)}`);
    return lines.join('\n');
};

const shouldSendReminder = (diffMs, ruleMs) =>
    diffMs <= ruleMs && diffMs > ruleMs - REMINDER_WINDOW_MS;

const startCron = (client) => {
    console.log(
        `⏱️ Sistem Reminder Aktif (Cek setiap ${CRON_INTERVAL_MINUTES} menit)`
    );

    cron.schedule(`*/${CRON_INTERVAL_MINUTES} * * * *`, async () => {
        const now = new Date();
        const db = bacaData();
        const groupSettings = loadGroupSettings();
        const groupIds = Object.keys(db);
        let dbUpdated = false;

        for (const id of groupIds) {
            if (!db[id].tugas || !id.includes('@')) continue;

            const groupSetting = groupSettings[id] || {};
            if (groupSetting.reminderSnoozeUntil) {
                const until = new Date(groupSetting.reminderSnoozeUntil);
                if (!Number.isNaN(until.getTime()) && now < until) {
                    continue;
                }
            }

            const reminderRules = getGroupReminderRules(groupSettings, id);
            const tasks = db[id].tugas;
            for (const task of tasks) {
                if (task.selesai) continue;
                const deadlineValue =
                    task.deadlineTs ||
                    task.deadlineISO ||
                    task.deadlineDate ||
                    task.deadline;
                const dl = parseDeadline(deadlineValue);
                if (!dl || Number.isNaN(dl.getTime())) continue;

                const diffMs = dl.getTime() - now.getTime();
                if (diffMs <= 0) continue;

                const reminderState =
                    task.reminders && typeof task.reminders === 'object'
                        ? task.reminders
                        : {};

                for (const rule of reminderRules) {
                    if (reminderState[rule.key]) continue;
                    if (!shouldSendReminder(diffMs, rule.ms)) continue;

                    const message = buildReminderMessage(task, rule, diffMs);
                    try {
                        await enqueueSend(() => client.sendMessage(id, message));
                        reminderState[rule.key] = new Date().toISOString();
                        task.reminders = reminderState;
                        dbUpdated = true;
                        await sleep(2000);
                    } catch (err) {
                        console.error(`❌ Gagal kirim reminder ke ${id}:`, err.message);
                    }
                    break;
                }
            }
        }

        if (dbUpdated) {
            simpanData(db);
        }
    });
};

module.exports = { startCron };
