const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { trackMenuResult } = require('./menu');

const CONFIG_PATH = path.join(__dirname, '..', 'ai_config.json');
const DATASET_DIR = path.join(__dirname, '..', 'dataset');
const MEMORY_DIR = path.join(__dirname, '..', 'memory');
const GENERAL_MEMORY_DIR = path.join(MEMORY_DIR, 'general');
const CKAI_MEMORY_DIR = path.join(MEMORY_DIR, 'ckai');
const CKAI_SESSION_TTL_MS = 1000 * 60 * 60 * 6;
const ckaiSessions = new Map();

const DEFAULT_MODELS = {
    openai: 'gpt-4o-mini',
    gemini: 'gemini-flash-lite-latest',
    grok: 'grok-beta'
};

const DEFAULT_CONFIG = {
    ai: {
        provider: 'openai',
        model: DEFAULT_MODELS.openai,
        models: {
            openai: DEFAULT_MODELS.openai,
            gemini: DEFAULT_MODELS.gemini,
            grok: DEFAULT_MODELS.grok
        },
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
                'Jika ini pesan pertama di sesi, JANGAN langsung beri indeks. Wajib minta user menjawab dalam SATU pesan dengan format berikut (gunakan baris baru): Tentu! Sebelum kita mulai, saya perlu beberapa informasi dari kamu untuk membantu mengevaluasi penggunaan AI dalam tugasmu. Silakan jawab dalam satu pesan:\\n\\n1. Tugas apa yang sedang kamu kerjakan dan kapan deadline-nya?\\n2. Bagian mana yang akan kamu bantu dengan AI dan tools apa yang akan kamu gunakan?\\n3. Bagian mana yang akan kamu kerjakan sendiri (baca/analisis/menulis/verifikasi sumber)?\\n4. Jika tanpa AI, seberapa sulit tugas ini (skala 0-10)?\\n\\nSetelah itu, saya akan menghitung CKAI Index dan memberikan saran yang sesuai. Terima kasih!',
                'Gunakan format output tetap dengan label jelas dan ringkas: Ringkasan konteks (1-2 kalimat), CKAI Index X/10 + level (0-3 Rendah, 4-6 Sedang, 7-10 Tinggi), Indikator yang terdeteksi (3-6 poin), Langkah aman 7 hari (3-5 langkah), Pilihan lanjut (balas angka).',
                'Saat memberi skor, jelaskan secara transparan indikator yang membuat skor naik/turun. Jangan menghakimi.',
                'Saran harus spesifik sesuai jawaban user; sebutkan 1-2 detail dari jawaban untuk menunjukkan relevansi.',
                'Indikator yang boleh dipakai (pilih yang relevan): tidak bisa mulai tanpa AI; copy-paste/ketergantungan generatif; minim verifikasi sumber; AI jadi pengambil keputusan; AI dipakai untuk menutupi kurang paham; ketergantungan untuk struktur/kalimat; penggunaan di situasi terlarang (ujian); abai privasi/data; ketergantungan emosional/validasi.',
                'Langkah aman harus realistis dan spesifik (contoh: 15 menit menulis dulu tanpa AI; gunakan AI hanya untuk brainstorming lalu wajib verifikasi 2 sumber; buat checklist "apa yang aku pahami sendiri"; batasi prompt jadi pertanyaan Socratic; journaling singkat setelah pakai AI: apa yang kupelajari?).',
                'Selalu ingatkan integritas akademik: jangan gunakan AI untuk kecurangan/menyalin jawaban; patuhi aturan kampus/dosen. Kalau user minta cara curang, tolak dan arahkan ke cara belajar yang benar.',
                'Jangan tampilkan bagian Pilihan lanjut pada pesan pertama yang berisi 4 pertanyaan awal. Tampilkan Pilihan lanjut hanya setelah user menjawab pertanyaan tersebut.',
                'Akhiri dengan blok berikut (gunakan baris baru): Pilihan Lanjut: (1) Simulasi ngerjain tugas tanpa AI (step-by-step). (2) Bikin aturan penggunaan AI personal. (3) Latihan bertanya kritis ke AI (prompt yang mendorong berpikir). (4) Lanjutkan penjelasan lebih jauh. (0) Akhiri sesi.'
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

const touchCkaiSession = (userId, chatId) => {
    if (!userId) return;
    ckaiSessions.set(userId, { chatId: chatId || null, lastActive: Date.now() });
};

const clearCkaiSession = (userId) => {
    if (!userId) return;
    ckaiSessions.delete(userId);
};

const isCkaiSessionActive = (userId, chatId) => {
    if (!userId) return false;
    const session = ckaiSessions.get(userId);
    if (!session) return false;
    const expired = Date.now() - session.lastActive > CKAI_SESSION_TTL_MS;
    if (expired) {
        ckaiSessions.delete(userId);
        return false;
    }
    if (chatId && session.chatId && session.chatId !== chatId) return false;
    return true;
};

const normalizeProvider = (value) => {
    const raw = (value || '').toString().trim().toLowerCase();
    if (['gemini', 'google', 'genai'].includes(raw)) return 'gemini';
    if (['grok', 'xai'].includes(raw)) return 'grok';
    return 'openai';
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

    const provider = normalizeProvider(process.env.AI_PROVIDER || cfg.provider);
    const models = {
        openai:
            process.env.OPENAI_MODEL ||
            cfg.models?.openai ||
            cfg.model ||
            DEFAULT_MODELS.openai,
        gemini: process.env.GEMINI_MODEL || cfg.models?.gemini || DEFAULT_MODELS.gemini,
        grok: process.env.GROK_MODEL || cfg.models?.grok || DEFAULT_MODELS.grok
    };

    return {
        provider,
        models,
        model: models.openai,
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
let grokClient = null;
let geminiClient = null;
const messageContext = new Map();
const activeCkaiSessions = new Map();

const getMessageId = (message) => {
    return message?.id?._serialized || null;
};

const rememberMessageContext = (message, context) => {
    const messageId = getMessageId(message);
    if (!messageId || !context) return;
    messageContext.set(messageId, context);
};

const getMessageContext = (message) => {
    const messageId = getMessageId(message);
    if (!messageId) return null;
    return messageContext.get(messageId) || null;
};

const setActiveCkaiSession = (userId, context) => {
    if (!userId || !context) return;
    activeCkaiSessions.set(userId, { ...context, updatedAt: Date.now() });
};

const clearActiveCkaiSession = (userId) => {
    if (!userId) return;
    activeCkaiSessions.delete(userId);
};

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

const CKAI_OPTION_LINE =
    'Pilihan Lanjut:\n' +
    '1. Simulasi ngerjain tugas tanpa AI (step-by-step).\n' +
    '2. Bikin aturan penggunaan AI personal.\n' +
    '3. Latihan bertanya kritis ke AI (prompt yang mendorong berpikir).\n' +
    '4. Lanjutkan penjelasan lebih jauh.\n' +
    '0. Akhiri sesi.';

const CKAI_QUESTION_TEXT =
    'Tentu! Sebelum kita mulai, saya perlu beberapa informasi dari kamu untuk membantu mengevaluasi penggunaan AI dalam tugasmu. Silakan jawab dalam satu pesan:\n' +
    '\n' +
    '1. Tugas apa yang sedang kamu kerjakan dan kapan deadline-nya?\n' +
    '2. Bagian mana yang akan kamu bantu dengan AI dan tools apa yang akan kamu gunakan?\n' +
    '3. Bagian mana yang akan kamu kerjakan sendiri (baca/analisis/menulis/verifikasi sumber)?\n' +
    '4. Jika tanpa AI, seberapa sulit tugas ini (skala 0-10)?\n' +
    '\n' +
    'Setelah itu, saya akan menghitung CKAI Index dan memberikan saran yang sesuai. Terima kasih!';

const CKAI_OPTION_KEYWORDS = [
    'simulasi ngerjain tugas tanpa ai',
    'bikin aturan penggunaan ai personal',
    'latihan bertanya kritis ke ai',
    'lanjutkan penjelasan lebih jauh',
    'akhiri sesi'
];

const stripCkaiOptionList = (text) => {
    if (!text) return text;
    const lines = text
        .split('\n')
        .filter((line) => !line.toLowerCase().includes('pilihan lanjut'));
    const filtered = lines.filter((line) => {
        const lower = line.toLowerCase();
        if (!/^\s*[0-4]\.\s*/.test(lower)) return true;
        return !CKAI_OPTION_KEYWORDS.some((kw) => lower.includes(kw));
    });
    return filtered.join('\n').trim();
};

const ensureCkaiOptions = (text) => {
    if (!text) return text;
    const cleaned = stripCkaiOptionList(text);
    const lines = cleaned.split('\n');
    const idx = lines.findIndex((line) => line.toLowerCase().includes('pilihan lanjut'));
    if (idx >= 0) {
        lines[idx] = CKAI_OPTION_LINE;
        return lines.join('\n');
    }
    return `${cleaned}\n\n${CKAI_OPTION_LINE}`;
};

const stripCkaiOptions = (text) => {
    if (!text) return text;
    const lines = text.split('\n').filter((line) => !line.toLowerCase().includes('pilihan lanjut'));
    return lines.join('\n').trim();
};

const isCkaiQuestionnaire = (text) => {
    if (!text) return false;
    const lower = text.toLowerCase();
    const hasNumbers = ['1.', '2.', '3.', '4.'].every((n) => lower.includes(n));
    const hasTugas = lower.includes('tugas');
    const hasDeadline = lower.includes('deadline');
    const hasSulit = lower.includes('seberapa sulit') || lower.includes('skala');
    return hasNumbers && hasTugas && hasDeadline && hasSulit;
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
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;
    if (!openaiClient) {
        const baseURL = process.env.OPENAI_BASE_URL || undefined;
        openaiClient = new OpenAI({ apiKey, baseURL });
    }
    return openaiClient;
};

const getGrokClient = () => {
    const apiKey = process.env.XAI_API_KEY || process.env.GROK_API_KEY;
    if (!apiKey) return null;
    if (!grokClient) {
        const baseURL = process.env.GROK_BASE_URL || 'https://api.x.ai/v1';
        grokClient = new OpenAI({ apiKey, baseURL });
    }
    return grokClient;
};

const getGeminiClient = () => {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) return null;
    if (!geminiClient) {
        geminiClient = new GoogleGenerativeAI(apiKey);
    }
    return geminiClient;
};

const buildSystemPrompt = (systemOverride) => {
    return (systemOverride || aiConfig.defaultSystemPrompt).trim();
};

const buildOpenAiMessages = ({ systemPrompt, knowledgeContext, history, prompt }) => {
    const messages = [{ role: 'system', content: systemPrompt }];
    if (knowledgeContext) {
        messages.push({ role: 'system', content: knowledgeContext });
    }
    return messages.concat(history || [], [{ role: 'user', content: prompt }]);
};

const toGeminiHistory = (history) => {
    return (history || [])
        .map((entry) => {
            if (!entry || !entry.role || !entry.content) return null;
            return {
                role: entry.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: entry.content }]
            };
        })
        .filter(Boolean);
};

const requestOpenAiCompatible = async ({ client, model, messages }) => {
    const completion = await client.chat.completions.create({
        model,
        messages,
        max_tokens: aiConfig.maxTokens,
        temperature: aiConfig.temperature
    });
    return completion.choices?.[0]?.message?.content?.trim() || 'Tidak ada respons.';
};

const requestGemini = async ({ prompt, systemPrompt, knowledgeContext, history, model }) => {
    const client = getGeminiClient();
    if (!client) return 'GEMINI_API_KEY belum di-set.';
    const combinedSystem = [systemPrompt, knowledgeContext].filter(Boolean).join('\n\n');
    const geminiModel = client.getGenerativeModel({
        model,
        systemInstruction: combinedSystem,
        generationConfig: {
            temperature: aiConfig.temperature,
            maxOutputTokens: aiConfig.maxTokens
        }
    });
    const chat = geminiModel.startChat({ history: toGeminiHistory(history) });
    const result = await chat.sendMessage(prompt);
    const response = result?.response;
    const text = response && typeof response.text === 'function' ? response.text() : '';
    return (text || 'Tidak ada respons.').trim();
};

const getAiReply = async ({
    promptRaw,
    systemOverride,
    fixedSystemPrompt,
    historyKey,
    persistDir,
    knowledgeContext
}) => {
    const provider = aiConfig.provider;
    const systemPrompt = (fixedSystemPrompt || buildSystemPrompt(systemOverride)).trim();
    const safePrompt = (promptRaw || '').slice(0, aiConfig.maxUserPrompt);
    const history = await loadHistory(persistDir, historyKey);
    let answer = 'Tidak ada respons.';
    if (provider === 'gemini') {
        answer = await requestGemini({
            prompt: safePrompt,
            systemPrompt,
            knowledgeContext,
            history,
            model: aiConfig.models.gemini
        });
    } else {
        const isGrok = provider === 'grok';
        const client = isGrok ? getGrokClient() : getOpenAiClient();
        if (!client) {
            return isGrok ? 'GROK_API_KEY belum di-set.' : 'OPENAI_API_KEY belum di-set.';
        }
        const messages = buildOpenAiMessages({
            systemPrompt,
            knowledgeContext,
            history,
            prompt: safePrompt
        });
        answer = await requestOpenAiCompatible({
            client,
            model: isGrok ? aiConfig.models.grok : aiConfig.models.openai,
            messages
        });
    }

    const replyText = (answer || 'Tidak ada respons.').slice(0, aiConfig.maxReply);

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
        const sent = await msg.reply(text);
        if (!trackedResult && commandCategory) {
            trackMenuResult(chatId, commandCategory);
            trackedResult = true;
        }
        return sent;
    };

    const askKey = `askai:${chatId}:${userId}`;
    const ckaiKey = `ckai:${userId}`;

    switch (cmd) {
        case '!askai': {
            if (!argText) {
                await reply('Format: !askai pertanyaan');
                return true;
            }
            try {
                const knowledgeContext = buildCkaiKnowledge(argText);
                const replyText = await getAiReply({
                    promptRaw: argText,
                    systemOverride: null,
                    fixedSystemPrompt: null,
                    historyKey: askKey,
                    persistDir: GENERAL_MEMORY_DIR,
                    knowledgeContext
                });
                const sent = await reply(replyText);
                rememberMessageContext(sent, {
                    flow: 'askai',
                    historyKey: askKey,
                    persistDir: GENERAL_MEMORY_DIR,
                    systemOverride: null,
                    fixedSystemPrompt: null
                });
            } catch (err) {
                await reply('Gagal memproses permintaan AI.');
            }
            return true;
        }
        case '!ckai': {
            const prompt = argText || 'Mulai sesi CKAI.';
            try {
                const ckaiContext = {
                    flow: 'ckai',
                    historyKey: ckaiKey,
                    persistDir: CKAI_MEMORY_DIR,
                    systemOverride: null,
                    fixedSystemPrompt: aiConfig.ckaiSystemPrompt,
                    knowledgeBase: 'ckai',
                    userId
                };
                let finalReply = '';
                if (!argText) {
                    await clearHistory(CKAI_MEMORY_DIR, ckaiKey);
                    await saveHistory(CKAI_MEMORY_DIR, ckaiKey, [
                        { role: 'assistant', content: CKAI_QUESTION_TEXT }
                    ]);
                    finalReply = CKAI_QUESTION_TEXT;
                } else {
                    const knowledgeContext = buildCkaiKnowledge(prompt);
                    const replyText = await getAiReply({
                        promptRaw: prompt,
                        systemOverride: null,
                        fixedSystemPrompt: aiConfig.ckaiSystemPrompt,
                        historyKey: ckaiKey,
                        persistDir: CKAI_MEMORY_DIR,
                        knowledgeContext
                    });
                    finalReply = isCkaiQuestionnaire(replyText)
                        ? stripCkaiOptions(replyText)
                        : ensureCkaiOptions(replyText);
                }
                const chat = await msg.getChat().catch(() => null);
                const isGroup = !!chat?.isGroup;
                if (!isGroup) {
                    const sent = await reply(finalReply);
                    rememberMessageContext(sent, ckaiContext);
                    setActiveCkaiSession(userId, ckaiContext);
                    return true;
                }

                const contact = await msg.getContact().catch(() => null);
                const dmId = contact?.id?._serialized;
                const client = ctx.client || msg.client;
                if (dmId && client?.sendMessage) {
                    const dmMessage = await client.sendMessage(dmId, finalReply);
                    rememberMessageContext(dmMessage, ckaiContext);
                    setActiveCkaiSession(userId, ckaiContext);
                    await reply('Oke, aku lanjutkan lewat chat pribadi ya.');
                    return true;
                }

                const sent = await reply(finalReply);
                rememberMessageContext(sent, ckaiContext);
                setActiveCkaiSession(userId, ckaiContext);
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
                clearActiveCkaiSession(userId);
                await reply('Riwayat ckai direset.');
                return true;
            }
            await clearHistory(GENERAL_MEMORY_DIR, askKey);
            await clearHistory(CKAI_MEMORY_DIR, ckaiKey);
            clearActiveCkaiSession(userId);
            await reply('Riwayat askai dan ckai direset.');
            return true;
        }
        default:
            return false;
    }
};

const handleAiFollowUp = async (msg, ctx = {}) => {
    const pesan = (msg.body || '').trim();
    if (!pesan || pesan.startsWith('!')) return false;

    const userId = ctx.userId || 'user';
    const chat = ctx.chat || (await msg.getChat().catch(() => null));
    const isGroup = !!chat?.isGroup;

    let quotedMsg = ctx.quotedMsg || null;
    if (!quotedMsg && msg.hasQuotedMsg) {
        quotedMsg = await msg.getQuotedMessage().catch(() => null);
    }

    let sessionContext = null;
    if (quotedMsg && quotedMsg.fromMe) {
        sessionContext = getMessageContext(quotedMsg);
    }

    if (!sessionContext && !isGroup) {
        sessionContext = activeCkaiSessions.get(userId) || null;
    }

    if (!sessionContext || sessionContext.flow !== 'ckai') return false;

    const endKeyword = (pesan || '').toLowerCase().trim();
    if (['0', 'selesai', 'akhiri', 'akhir', 'stop', 'keluar', 'tutup'].includes(endKeyword)) {
        const historyKey = sessionContext.historyKey || `ckai:${userId}`;
        await clearHistory(CKAI_MEMORY_DIR, historyKey);
        clearActiveCkaiSession(userId);
        await msg.reply('Sesi CKAI selesai. Kalau mau mulai lagi, ketik !ckai.');
        return true;
    }

    const nextContext = {
        flow: 'ckai',
        historyKey: sessionContext.historyKey || `ckai:${userId}`,
        persistDir: CKAI_MEMORY_DIR,
        systemOverride: sessionContext.systemOverride ?? null,
        fixedSystemPrompt: sessionContext.fixedSystemPrompt || aiConfig.ckaiSystemPrompt,
        knowledgeBase: 'ckai',
        userId
    };

    try {
        const knowledgeContext = buildCkaiKnowledge(pesan);
        const replyText = await getAiReply({
            promptRaw: pesan,
            systemOverride: nextContext.systemOverride,
            fixedSystemPrompt: nextContext.fixedSystemPrompt,
            historyKey: nextContext.historyKey,
            persistDir: nextContext.persistDir,
            knowledgeContext
        });
        const finalReply = ensureCkaiOptions(replyText);

        if (isGroup) {
            const contact = ctx.contact || (await msg.getContact().catch(() => null));
            const dmId = contact?.id?._serialized;
            const client = ctx.client || msg.client;
            if (dmId && client?.sendMessage) {
                const dmMessage = await client.sendMessage(dmId, finalReply);
                rememberMessageContext(dmMessage, nextContext);
                setActiveCkaiSession(userId, nextContext);
                await msg.reply('Oke, aku lanjutkan lewat chat pribadi ya.');
                return true;
            }
        }

        const sent = await msg.reply(finalReply);
        rememberMessageContext(sent, nextContext);
        setActiveCkaiSession(userId, nextContext);
    } catch (err) {
        await msg.reply('Gagal memproses permintaan CKAI.');
    }

    return true;
};

module.exports = { handleAiCommand, handleAiFollowUp };
