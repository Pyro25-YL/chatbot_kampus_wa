const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const cron = require('node-cron');
const { GoogleGenerativeAI } = require("@google/generative-ai");

// --- KONFIGURASI ---
const GEMINI_API_KEY = "AIzaSyCiZkdgV9GqXmf_hashkR7Fp-6sSw9mT1I"; // <--- PASTE KEY BARU
const DAFTAR_ADMIN = ['6282258756166','6281343381495','6289698926555']; 
const FILE_DB = './database.json';

// --- SETUP AI ---
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
    model: "gemini-flash-lite-latest",
    requestOptions: {
        baseUrl: "https://generativelanguage.googleapis.com" 
    }
});

// --- DATABASE SETUP ---
if (!fs.existsSync(FILE_DB)) fs.writeFileSync(FILE_DB, JSON.stringify({}));
const bacaData = () => { try { return JSON.parse(fs.readFileSync(FILE_DB)); } catch(e) { return {}; } };
const simpanData = (data) => fs.writeFileSync(FILE_DB, JSON.stringify(data, null, 2));

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { headless: false, args: ['--no-sandbox'] }
});

client.on('qr', (qr) => qrcode.generate(qr, { small: true }));
client.on('ready', () => console.log('✅ Bot Hybrid Siap! (AI + Manual Fallback)'));

// ==========================================
//    1. FUNGSI OTAK AI (GEMINI)
// ==========================================
async function tanyaGemini(pesan, dataGrup, namaUser) {
    const waktuSekarang = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta", weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    
    const prompt = `
    Peran: Asisten Bot WhatsApp Mahasiswa.
    Nama User: ${namaUser}
    Waktu Server: ${waktuSekarang}.

    DATABASE GRUP (JSON):
    ${JSON.stringify(dataGrup)}

    INSTRUKSI:
    1. JIKA user minta MENU/HELP: Jelaskan cara pakai.
    2. JIKA TAMBAH/HAPUS data (Tugas/Jadwal), outputkan JSON:
       - {"action": "ADD_TUGAS", "data": {"matkul": "...", "detail": "...", "tempat": "...", "format": "...", "deadline": "YYYY-MM-DD HH:mm"}}
       - {"action": "ADD_JADWAL", "data": {"hari": "...", "matkul": "...", "jam": "..."}}
       - {"action": "DELETE_TUGAS", "keyword": "..."}
       - {"action": "RESET"}
    3. JIKA NGOBROL/TANYA: Jawab santai berdasarkan Database.

    Pesan User: "${pesan}"
    `;

    try {
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        return text.replace(/```json/g, '').replace(/```/g, '').trim();
    } catch (error) {
        console.error("⚠️ AI Limit/Error:", error.message);
        return null; // Mengembalikan NULL jika AI mati/limit habis
    }
}

// ==========================================
//    2. LOGIKA MANUAL (FALLBACK)
// ==========================================
function prosesManual(msg, pesan, db, idGrup, isAdmin) {
    const prefix = pesan.split(' ')[0].toLowerCase();
    let replied = false;

    // --- MENU MANUAL ---
    if (pesan === '!menu' || pesan === '!help') {
        const menu = `🤖 *MODE MANUAL (AI OFF)*\n\n` +
            `Karena AI lagi limit/gangguan, pakai format ini ya:\n\n` +
            `📌 *Tambah Tugas:*\n!addtugas Matkul | Detail | Tempat | Format | YYYY-MM-DD HH:mm\n\n` +
            `📌 *Tambah Jadwal:*\n!addjadwal Hari | Matkul | Jam\n\n` +
            `📌 *Cek Data:*\n!tugas\n!jadwal\n\n` +
            `📌 *Hapus:*\n!hapustugas [nomor]\n!hapusjadwal [nomor]\n\n` +
            `_Tips: Awali chat dengan tanda seru (!) untuk hemat kuota AI._`;
        msg.reply(menu);
        replied = true;
    }

    // --- FITUR ADMIN MANUAL ---
    else if (isAdmin) {
        if (prefix === '!addtugas') {
            const isi = pesan.replace('!addtugas ', '').split('|');
            if (isi.length === 5) {
                let waktu = isi[4].trim().replace('.', ':');
                db[idGrup].tugas.push({ matkul: isi[0].trim(), detail: isi[1].trim(), tempat: isi[2].trim(), format: isi[3].trim(), deadline: waktu });
                simpanData(db);
                msg.reply(`✅ [Manual] Tugas tersimpan!`);
                replied = true;
            } else msg.reply('❌ Format salah! Cek !menu');
        }
        else if (prefix === '!hapustugas') {
            const num = parseInt(pesan.split(' ')[1]);
            if (!isNaN(num) && db[idGrup].tugas[num-1]) {
                const del = db[idGrup].tugas.splice(num-1, 1);
                simpanData(db);
                msg.reply(`🗑️ [Manual] Tugas ${del[0].matkul} dihapus.`);
                replied = true;
            }
        }
        else if (prefix === '!addjadwal') {
            const isi = pesan.replace('!addjadwal ', '').split('|');
            if (isi.length === 3) {
                db[idGrup].jadwal.push({ hari: isi[0].trim(), matkul: isi[1].trim(), jam: isi[2].trim() });
                simpanData(db);
                msg.reply(`✅ [Manual] Jadwal tersimpan!`);
                replied = true;
            }
        }
        else if (prefix === '!reset') {
            db[idGrup].tugas = []; db[idGrup].jadwal = [];
            simpanData(db);
            msg.reply('🗑️ [Manual] Data reset.');
            replied = true;
        }
    }

    // --- FITUR UMUM MANUAL ---
    if (!replied) {
        if (pesan === '!tugas') {
            if (db[idGrup].tugas.length === 0) return msg.reply('Zonk, gak ada tugas.');
            let t = `📝 *LIST TUGAS (MANUAL)*\n`;
            db[idGrup].tugas.forEach((x, i) => t += `\n${i+1}. *${x.matkul}*\n   DL: ${x.deadline}`);
            msg.reply(t);
            replied = true;
        }
        else if (pesan === '!jadwal') {
            let t = `📅 *JADWAL (MANUAL)*\n`;
            db[idGrup].jadwal.forEach((x, i) => t += `${i+1}. ${x.hari} - ${x.matkul} (${x.jam})\n`);
            msg.reply(t);
            replied = true;
        }
    }

    return replied;
}

// ==========================================
//    3. CORE LOGIC (HYBRID HANDLER)
// ==========================================
client.on('message', async msg => {
    const pesan = msg.body;
    const chat = await msg.getChat();
    const contact = await msg.getContact();
    const idGrup = chat.id._serialized; 
    const isAdmin = DAFTAR_ADMIN.includes(contact.number);

    // Filter Group & Mention
    if (chat.isGroup && !msg.mentionedIds.includes(client.info.wid._serialized) && !pesan.toLowerCase().includes('bot') && !pesan.startsWith('!')) return;

    // Init Database
    let db = bacaData();
    if (!db[idGrup]) db[idGrup] = { nama: chat.name || 'Grup', tugas: [], jadwal: [] };

    // --- STRATEGI HYBRID ---
    
    // 1. CEK APAKAH PESAN ADALAH PERINTAH MANUAL (!...)
    // Jika diawali "!", kita paksa pakai Manual Mode supaya HEMAT TOKEN AI.
    if (pesan.startsWith('!')) {
        console.log('⚡ Mode Manual Triggered (Hemat Token)');
        prosesManual(msg, pesan, db, idGrup, isAdmin);
        return;
    }

    // 2. JIKA BUKAN "!", COBA PAKAI AI
    chat.sendStateTyping();
    const responAI = await tanyaGemini(pesan, db[idGrup], contact.pushname);

    if (responAI !== null) {
        // --- AI BERHASIL (KUOTA ADA) ---
        try {
            if (responAI.startsWith('{') && responAI.endsWith('}')) {
                const cmd = JSON.parse(responAI);
                if (!isAdmin) return msg.reply("❌ Ups, cuma Admin yang boleh ubah data!");

                if (cmd.action === 'ADD_TUGAS') {
                    db[idGrup].tugas.push(cmd.data);
                    simpanData(db);
                    msg.reply(`✅ *AI: Tugas Tersimpan*\n📚 ${cmd.data.matkul}\n⏳ ${cmd.data.deadline}`);
                } 
                else if (cmd.action === 'ADD_JADWAL') {
                    db[idGrup].jadwal.push(cmd.data);
                    simpanData(db);
                    msg.reply(`✅ *AI: Jadwal Tersimpan*\n📅 ${cmd.data.hari} - ${cmd.data.matkul}`);
                }
                else if (cmd.action === 'DELETE_TUGAS') {
                    const idx = db[idGrup].tugas.findIndex(t => t.matkul.toLowerCase().includes(cmd.keyword.toLowerCase()));
                    if (idx !== -1) {
                        db[idGrup].tugas.splice(idx, 1);
                        simpanData(db);
                        msg.reply(`🗑️ AI: Tugas *${cmd.keyword}* dihapus.`);
                    } else msg.reply("❌ AI: Gak nemu tugas itu.");
                }
                else if (cmd.action === 'RESET') {
                    db[idGrup].tugas = []; db[idGrup].jadwal = [];
                    simpanData(db);
                    msg.reply("🗑️ AI: Data direset.");
                }
            } else {
                msg.reply(responAI); // AI Ngobrol Biasa
            }
        } catch (e) {
            msg.reply(responAI); // Fallback kalau JSON error
        }
    } else {
        // --- AI GAGAL (KUOTA HABIS / ERROR) ---
        // Cek apakah pesan bisa diproses manual (misal user ketik "!addtugas" tapi lupa tanda seru, atau sekedar info)
        console.log("⚠️ AI Mati, beralih ke Fallback");
        
        const manualSuccess = prosesManual(msg, pesan, db, idGrup, isAdmin);
        
        if (!manualSuccess) {
            // Jika tidak bisa diproses manual juga, beri tahu user
            msg.reply("⚠️ *Sistem AI Sedang Limit/Gangguan*\n\nSilakan gunakan perintah manual dengan awalan tanda seru (!).\nKetik *!menu* untuk panduan manual.");
        }
    }
});

// ==========================================
//    4. CRON JOBS (REMINDER & CLEANER)
// ==========================================
cron.schedule('0 * * * *', async () => { // Tiap Jam
    const db = bacaData();
    const now = new Date();
    for (const id in db) {
        if (!db[id].tugas) continue;
        for (const t of db[id].tugas) {
            const dl = new Date(t.deadline);
            const diff = (dl - now) / 36e5; // Selisih Jam
            if (diff > 0 && diff <= 24) {
                client.sendMessage(id, `⚠️ *REMINDER*: Tugas *${t.matkul}* deadline ${diff.toFixed(1)} jam lagi!`);
            }
        }
    }
});

cron.schedule('* * * * *', async () => { // Tiap Menit
    let db = bacaData();
    let changed = false;
    const now = new Date();
    for (const id in db) {
        if (db[id].tugas) {
            const active = db[id].tugas.filter(t => new Date(t.deadline) > now);
            if (active.length !== db[id].tugas.length) {
                db[id].tugas = active;
                changed = true;
            }
        }
    }
    if (changed) simpanData(db);
});

client.initialize();