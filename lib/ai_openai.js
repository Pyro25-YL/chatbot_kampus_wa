const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const { trackMenuResult } = require('./menu');

const CONFIG_PATH = path.join(__dirname, '..', 'ai_config.json');
const DATASET_DIR = path.join(__dirname, '..', 'dataset');
const MEMORY_DIR = path.join(__dirname, '..', 'memory');
const GENERAL_MEMORY_DIR = path.join(MEMORY_DIR, 'general');
const CKAI_MEMORY_DIR = path.join(MEMORY_DIR, 'ckai');

const DEFAULT_CONFIG = {
    ai: {
        model: 'gpt-4o-mini',
        temperature: 0.7,
        limits: {
            maxTokens: 4000,
            maxUserPrompt: 12000,
            maxReply: 1990
        },
        history: {
            maxTurns: 10
        },
        prompt: {
            defaultLines: [
                'You are a concise, helpful assistant. Keep replies short and actionable.',
                'You have access to the last 10 turns of this conversation (loaded for you). Use them to stay consistent.',
                'Never say you cannot remember; instead, acknowledge you remember the recent context and answer based on it.'
            ],
            ckaiLines: [
                'Kamu adalah asisten literasi digital kampus (tema: feodalisme digital & ketergantungan AI). Fokus: bantu mahasiswa tetap kritis, menjaga martabat/privasi, dan menggunakan AI secara sehat.',
                'Jawab dalam Bahasa Indonesia, ringkas, ramah, dan action-oriented.',
                'Gunakan konteks percakapan yang tersedia (maks 10 turn terakhir). Jika info kurang, tanyakan paling banyak 2 pertanyaan lanjutan dan jangan mengulang pertanyaan yang sudah dijawab.',
                'Jika ini pesan pertama di sesi, JANGAN langsung beri indeks. Wajib minta user menjawab dalam SATU pesan: (1) Tugas apa & deadline? (2) Bagian mana dibantu AI + tools apa? (3) Bagian mana kamu kerjakan sendiri (baca/analisis/menulis/verifikasi sumber)? (4) Kalau tanpa AI, seberapa sulit (0-10)? Setelah user menjawab, baru hitung indeks.',
                'Gunakan format output tetap: **Ringkasan konteks** (1-2 kalimat), **CKAI Index (0-10)** + level (0-3 Rendah, 4-6 Sedang, 7-10 Tinggi), **Indikator yang terdeteksi** (3-6 poin), **Langkah aman 7 hari** (3-5 langkah), **Pilihan lanjut** (minta user balas 1/2/3).',
                'Saat memberi skor, jelaskan secara transparan indikator yang membuat skor naik/turun. Jangan menghakimi.',
                'Indikator yang boleh dipakai (pilih yang relevan): tidak bisa mulai tanpa AI; copy-paste/ketergantungan generatif; minim verifikasi sumber; AI jadi pengambil keputusan; AI dipakai untuk menutupi kurang paham; ketergantungan untuk struktur/kalimat; penggunaan di situasi terlarang (ujian); abai privasi/data; ketergantungan emosional/validasi.',
                'Langkah aman harus realistis dan spesifik (contoh: 15 menit menulis dulu tanpa AI; gunakan AI hanya untuk brainstorming lalu wajib verifikasi 2 sumber; buat checklist "apa yang aku pahami sendiri"; batasi prompt jadi pertanyaan Socratic; journaling singkat setelah pakai AI: apa yang kupelajari?).',
                'Selalu ingatkan integritas akademik: jangan gunakan AI untuk kecurangan/menyalin jawaban; patuhi aturan kampus/dosen. Kalau user minta cara curang, tolak dan arahkan ke cara belajar yang benar.',
                'Akhiri dengan **Pilihan lanjut**: balas `1` untuk simulasi ngerjain tugas tanpa AI (step-by-step), `2` untuk bikin aturan penggunaan AI personal, `3` untuk latihan bertanya kritis ke AI (prompt yang mendorong berpikir).'
            ]
        }
    }
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

const loadConfig = () => {
    const raw = readJson(CONFIG_PATH, DEFAULT_CONFIG);
    const cfg = raw.ai || DEFAULT_CONFIG.ai;
    const promptDefault = Array.isArray(cfg.prompt?.defaultLines)
        ? cfg.prompt.defaultLines.join('\n')
        : cfg.prompt?.default || '';
    const promptCkai = Array.isArray(cfg.prompt?.ckaiLines)
        ? cfg.prompt.ckaiLines.join('\n')
        : cfg.prompt?.ckai || '';

    return {
        model: cfg.model || DEFAULT_CONFIG.ai.model,
        temperature: cfg.temperature ?? DEFAULT_CONFIG.ai.temperature,
        maxTokens: cfg.limits?.maxTokens ?? DEFAULT_CONFIG.ai.limits.maxTokens,
        maxUserPrompt: cfg.limits?.maxUserPrompt ?? DEFAULT_CONFIG.ai.limits.maxUserPrompt,
        maxReply: cfg.limits?.maxReply ?? DEFAULT_CONFIG.ai.limits.maxReply,
        historyMaxTurns: cfg.history?.maxTurns ?? DEFAULT_CONFIG.ai.history.maxTurns,
        defaultSystemPrompt:
            (process.env.AI_SYSTEM_PROMPT || promptDefault || DEFAULT_CONFIG.ai.prompt.defaultLines.join('\n')).trim(),
        ckaiSystemPrompt:
            (promptCkai || DEFAULT_CONFIG.ai.prompt.ckaiLines.join('\n')).trim()
    };
};

const aiConfig = loadConfig();
const qaDataset = readJson(path.join(DATASET_DIR, 'qa.json'), {});
const konsepDataset = readJson(path.join(DATASET_DIR, 'konsep.json'), {});
const jalurBelajarDataset = readJson(path.join(DATASET_DIR, 'jalur_belajar.json'), {});
const skenarioDataset = readJson(path.join(DATASET_DIR, 'skenario.json'), {});

let openaiClient = null;

const tokenizeKeywords = (text) => {
    return (
        (text || '')
            .toLowerCase()
            .match(/[a-z0-9_]+/g)
            ?.filter((token) => token.length > 2) || []
    );
};

const scoreAgainstKeywords = (content, keywords) => {
    if (!content || !keywords.length) return 0;
    const lower = content.toLowerCase();
    return keywords.reduce((score, kw) => (lower.includes(kw) ? score + 1 : score), 0);
};

const clipText = (text, max = 400) => {
    if (!text) return '';
    return text.length > max ? `${text.slice(0, max)}...` : text;
};

const pickQaContext = (keywords) => {
    const items = Array.isArray(qaDataset?.qa) ? qaDataset.qa : [];
    const scored = items
        .map((item) => ({
            item,
            score:
                scoreAgainstKeywords(item.user_question, keywords) * 2 +
                scoreAgainstKeywords(item.bot_answer, keywords) +
                scoreAgainstKeywords(item.topic, keywords) * 3 +
                scoreAgainstKeywords((item.tags || []).join(' '), keywords) * 2
        }))
        .sort((a, b) => b.score - a.score)
        .filter((entry) => entry.score > 0)
        .slice(0, 3)
        .map((entry) => entry.item);
    if (scored.length > 0) return scored;
    return items.slice(0, 3);
};

const pickKonsepContext = (keywords) => {
    const items = Array.isArray(konsepDataset?.konsep) ? konsepDataset.konsep : [];
    const scored = items
        .map((item) => ({
            item,
            score:
                scoreAgainstKeywords(item.nama, keywords) * 2 +
                scoreAgainstKeywords(item.short_definition, keywords) +
                scoreAgainstKeywords(item.long_explanation, keywords) +
                scoreAgainstKeywords(item.campus_examples, keywords)
        }))
        .sort((a, b) => b.score - a.score)
        .filter((entry) => entry.score > 0)
        .slice(0, 2)
        .map((entry) => entry.item);
    if (scored.length > 0) return scored;
    return items.slice(0, 2);
};

const pickSkenarioContext = (keywords) => {
    const items = Array.isArray(skenarioDataset?.skenario) ? skenarioDataset.skenario : [];
    const scored = items
        .map((item) => ({
            item,
            score:
                scoreAgainstKeywords(item.judul, keywords) * 2 +
                scoreAgainstKeywords(item.ringkasan, keywords) * 2 +
                scoreAgainstKeywords(item.narasi, keywords) +
                scoreAgainstKeywords((item.poin_etika || []).join(' '), keywords)
        }))
        .sort((a, b) => b.score - a.score)
        .filter((entry) => entry.score > 0)
        .slice(0, 1)
        .map((entry) => entry.item);
    if (scored.length > 0) return scored;
    return items.slice(0, 1);
};

const pickJalurContext = (keywords) => {
    const tracks = Array.isArray(jalurBelajarDataset?.jalur_belajar)
        ? jalurBelajarDataset.jalur_belajar
        : [];
    const modules = tracks.flatMap((track) =>
        (track.modul || []).map((module) => ({ track, module }))
    );
    const scored = modules
        .map(({ track, module }) => ({
            track,
            module,
            score:
                scoreAgainstKeywords(track.level, keywords) +
                scoreAgainstKeywords(track.label, keywords) +
                scoreAgainstKeywords(module.judul, keywords) * 2 +
                scoreAgainstKeywords(module.fokus, keywords) +
                scoreAgainstKeywords(module.tujuan, keywords)
        }))
        .sort((a, b) => b.score - a.score)
        .filter((entry) => entry.score > 0)
        .slice(0, 2);
    if (scored.length > 0) return scored;
    return modules.slice(0, 2).map((entry) => ({ track: entry.track, module: entry.module }));
};

const buildCkaiKnowledge = (userText = '') => {
    const keywords = tokenizeKeywords(userText);
    const qaList = pickQaContext(keywords);
    const konsepList = pickKonsepContext(keywords);
    const skenarioList = pickSkenarioContext(keywords);
    const modulList = pickJalurContext(keywords);

    const parts = [
        'Gunakan dataset literasi digital kampus (tema: feodalisme digital, ketergantungan AI, hak digital mahasiswa). Tetap singkat, gunakan data sebagai referensi, jangan mengarang fakta baru.'
    ];

    konsepList.forEach((konsep) => {
        parts.push(`Konsep ${konsep.nama}: ${clipText(konsep.short_definition, 260)}`);
    });

    qaList.forEach((qa) => {
        parts.push(
            `QA ${qa.id}: ${clipText(qa.user_question, 140)} | Jawaban ringkas: ${clipText(
                qa.bot_answer,
                260
            )}`
        );
    });

    skenarioList.forEach((sk) => {
        parts.push(
            `Skenario ${sk.id} (${sk.judul}): ${clipText(sk.ringkasan, 240)} | Etika: ${clipText(
                (sk.poin_etika || []).join('; '),
                220
            )}`
        );
    });

    modulList.forEach(({ track, module }) => {
        parts.push(
            `Modul ${module.id} (${track.label}): ${clipText(
                module.tujuan,
                180
            )} | Pertanyaan refleksi: ${clipText((module.pertanyaan_refleksi || [])[0] || '', 120)}`
        );
    });

    return clipText(parts.join('\n'), 3500);
};

const sanitizeKey = (key) => {
    return key.replace(/[^a-zA-Z0-9_-]/g, '_');
};

const ensureMemoryDir = (dirPath) => {
    if (!dirPath) return;
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
};

const loadHistory = async (dirPath, key) => {
    if (!dirPath || !key || aiConfig.historyMaxTurns <= 0) return [];
    const safeKey = sanitizeKey(key);
    const filePath = path.join(dirPath, `${safeKey}.json`);
    try {
        const raw = await fs.promises.readFile(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
    } catch (e) {
        return [];
    }
    return [];
};

const saveHistory = async (dirPath, key, history) => {
    if (!dirPath || !key || aiConfig.historyMaxTurns <= 0) return;
    ensureMemoryDir(dirPath);
    const safeKey = sanitizeKey(key);
    const filePath = path.join(dirPath, `${safeKey}.json`);
    const cap = aiConfig.historyMaxTurns > 0 ? aiConfig.historyMaxTurns * 2 : undefined;
    const trimmed = cap ? history.slice(-cap) : history;
    await fs.promises.writeFile(filePath, JSON.stringify(trimmed), 'utf8');
};

const clearHistory = async (dirPath, key) => {
    if (!dirPath || !key) return;
    const safeKey = sanitizeKey(key);
    const filePath = path.join(dirPath, `${safeKey}.json`);
    await fs.promises.unlink(filePath).catch(() => {});
};

const getOpenAiClient = () => {
    if (!process.env.OPENAI_API_KEY) return null;
    if (!openaiClient) {
        openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return openaiClient;
};

const buildSystemPrompt = (systemOverride) => {
    return (systemOverride || aiConfig.defaultSystemPrompt).trim();
};

const getAiReply = async ({
    promptRaw,
    systemOverride,
    fixedSystemPrompt,
    historyKey,
    persistDir,
    knowledgeContext
}) => {
    const client = getOpenAiClient();
    if (!client) {
        return 'OPENAI_API_KEY belum di-set.';
    }

    const systemPrompt = (fixedSystemPrompt || buildSystemPrompt(systemOverride)).trim();
    const safePrompt = (promptRaw || '').slice(0, aiConfig.maxUserPrompt);
    const history = await loadHistory(persistDir, historyKey);

    const messages = [
        { role: 'system', content: systemPrompt },
        ...(knowledgeContext ? [{ role: 'system', content: knowledgeContext }] : []),
        ...history,
        { role: 'user', content: safePrompt }
    ];

    const completion = await client.chat.completions.create({
        model: aiConfig.model,
        messages,
        max_tokens: aiConfig.maxTokens,
        temperature: aiConfig.temperature
    });

    const answer = completion.choices?.[0]?.message?.content?.trim() || 'Tidak ada respons.';
    const replyText = answer.slice(0, aiConfig.maxReply);

    const nextHistory = history.concat([
        { role: 'user', content: safePrompt },
        { role: 'assistant', content: replyText }
    ]);
    await saveHistory(persistDir, historyKey, nextHistory);

    return replyText;
};

const handleAiCommand = async (msg, ctx) => {
    const pesan = (msg.body || '').trim();
    if (!pesan.startsWith('!')) return false;

    const [cmdRaw, ...rest] = pesan.split(' ');
    const cmd = cmdRaw.toLowerCase();
    const argText = rest.join(' ').trim();

    const chatId = ctx.chatId || 'chat';
    const userId = ctx.userId || 'user';
    const commandCategory = ['!askai', '!ckai', '!ai-reset'].includes(cmd) ? 'ai' : null;
    let trackedResult = false;

    const reply = async (text) => {
        await msg.reply(text);
        if (!trackedResult && commandCategory) {
            trackMenuResult(chatId, commandCategory);
            trackedResult = true;
        }
    };

    const askKey = `askai:${chatId}:${userId}`;
    const ckaiKey = `ckai:${chatId}:${userId}`;

    switch (cmd) {
        case '!askai': {
            if (!argText) {
                await reply('Format: !askai pertanyaan');
                return true;
            }
            try {
                const replyText = await getAiReply({
                    promptRaw: argText,
                    systemOverride: null,
                    fixedSystemPrompt: null,
                    historyKey: askKey,
                    persistDir: GENERAL_MEMORY_DIR,
                    knowledgeContext: ''
                });
                await reply(replyText);
            } catch (err) {
                await reply('Gagal memproses permintaan AI.');
            }
            return true;
        }
        case '!ckai': {
            const prompt = argText || 'Mulai sesi CKAI.';
            try {
                const knowledgeContext = buildCkaiKnowledge(prompt);
                const replyText = await getAiReply({
                    promptRaw: prompt,
                    systemOverride: null,
                    fixedSystemPrompt: aiConfig.ckaiSystemPrompt,
                    historyKey: ckaiKey,
                    persistDir: CKAI_MEMORY_DIR,
                    knowledgeContext
                });
                await reply(replyText);
            } catch (err) {
                await reply('Gagal memproses permintaan CKAI.');
            }
            return true;
        }
        case '!ai-reset': {
            const target = argText.toLowerCase();
            if (target === 'askai') {
                await clearHistory(GENERAL_MEMORY_DIR, askKey);
                await reply('Riwayat askai direset.');
                return true;
            }
            if (target === 'ckai') {
                await clearHistory(CKAI_MEMORY_DIR, ckaiKey);
                await reply('Riwayat ckai direset.');
                return true;
            }
            await clearHistory(GENERAL_MEMORY_DIR, askKey);
            await clearHistory(CKAI_MEMORY_DIR, ckaiKey);
            await reply('Riwayat askai dan ckai direset.');
            return true;
        }
        default:
            return false;
    }
};

module.exports = { handleAiCommand };
