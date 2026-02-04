    const { NlpManager } = require('node-nlp');
    const fs = require('fs');
    const FILE_MODEL = './model.nlp'; 

    const manager = new NlpManager({ languages: ['id'], nlu: { useNoneFeature: true } });
    let isModelLoaded = false;

    // --- FUNGSI INIT (Wajib ada dipanggil index.js) ---
    const init = async () => {
        try {
            if (fs.existsSync(FILE_MODEL)) {
                const data = fs.readFileSync(FILE_MODEL, 'utf8');
                manager.import(JSON.parse(data));
                isModelLoaded = true;
                console.log("🧠 JUMBO ENGINE (1.3M): READY & PROTECTED");
            } else {
                console.log("⚠️ Model NLP belum ada, bot berjalan dengan Logic Manual (Layer 1).");
            }
        } catch (err) { 
            console.error("❌ Gagal load model:", err); 
        }
    };

    const processText = async (text) => {
        if (!text) return { intent: 'None', score: 0 };
        let cleanText = text.toLowerCase().trim();

        // ==========================================================
        // LAYER 1: HARD RULES & REGEX (PRIORITAS TINGGI)
        // Menangani perintah spesifik dan ekstraksi data
        // ==========================================================

        // 1. MENU & BANTUAN (Dari Incoming)
        if (['menu', 'help', 'bantuan', '!menu'].includes(cleanText)) {
            return { intent: 'menu.lihat', score: 1.0 };
        }
        if (cleanText.includes('tutorial') || cleanText.includes('panduan')) {
            return { intent: 'tutorial.lihat', score: 1.0 };
        }

        // 2. DETEKSI KEYWORDS DASAR
        const isCheck = cleanText.match(/\b(lihat|cek|mana|daftar|list|info|tampil)\b/);
        const isTask = cleanText.match(/\b(tugas|pr|pekerjaan rumah)\b/);
        const isSchedule = cleanText.match(/\b(jadwal|matkul|kuliah|pelajaran)\b/);
        const isDelete = cleanText.match(/\b(hapus|delete|kelar|selesai|batal)\b/);
        const isEdit = cleanText.match(/\b(edit|ubah|ganti|update|koreksi)\b/);
        

        // 3. LIHAT DATA
        if (isTask && (isCheck || cleanText === 'tugas' || cleanText === 'list tugas')) {
            return { intent: 'tugas.lihat', score: 1.0 };
        }
        if (isSchedule && (isCheck || cleanText === 'jadwal' || cleanText === 'cek jadwal')) {
            return { intent: 'jadwal.lihat', score: 1.0 };
        }

        // 4. TAMBAH TUGAS (PENTING: Pakai Logic HEAD untuk Ekstraksi Data)
        const isTambah = cleanText.includes('tambah') || cleanText.startsWith('catat') || cleanText.startsWith('input') || cleanText.includes('baru') || cleanText.startsWith('buat');
        const hasKeywords = cleanText.includes('matkul') && cleanText.includes('deadline');

        if ((isTambah && isTask) || hasKeywords) {
            // Ambil isi tugas (hapus kata kunci perintah)
            const isi = text.replace(/.*?(tugas|pr|baru|buat|catat)\s*/i, '').trim();
            
            // Ambil deadline
            const deadlineMatch = text.match(/deadline\s+([\w\s,.:-]+)/i);
            let deadline = deadlineMatch ? deadlineMatch[1].trim() : null;
            
            // Bersihkan deadline jika ada koma berlebih
            if (deadline && deadline.includes(',')) deadline = deadline.split(',')[0].trim();

            return { 
                intent: 'tugas.tambah', 
                score: 1.0, 
                entities: [
                    { entity: 'isi_tugas', option: isi },
                    { entity: 'deadline', option: deadline }
                ] 
            };
        }

        // 5. TAMBAH JADWAL
        if ((isTambah && isSchedule)) {
            const isi = text.replace(/.*?(jadwal)\s*/i, '').trim();
            return { intent: 'jadwal.tambah', score: 1.0, entities: [{ entity: 'isi_jadwal', option: isi }] };
        }

        // 6. HAPUS TUGAS
        if (isTask && isDelete) {
            const numbers = cleanText.match(/\d+/g); 
            if (numbers) {
                return { intent: 'tugas.hapus_pilih', score: 1.0, entities: [{ entity: 'nomor_tugas', option: numbers }] };
            }
            return { intent: 'tugas.hapus_confirm', score: 1.0 };
        }
        // 7. HAPUS JADWAL (Manual Override)
    // Jika ada kata 'hapus' + 'jadwal' + 'angka'
    if (isDelete && isSchedule) {
        const numbers = cleanText.match(/\d+/g);
        if (numbers) {
            // Langsung arahkan ke intent jadwal.hapus
            return { 
                intent: 'jadwal.hapus', 
                score: 1.0, 
                entities: [{ entity: 'nomor_jadwal', option: numbers }] 
            };
        }
    }
    // 8. EDIT TUGAS
    if (isTask && isEdit) {
        const numbers = cleanText.match(/\d+/); // Ambil angka pertama sebagai ID
        if (numbers) {
            return { 
                intent: 'tugas.edit', 
                score: 1.0, 
                entities: [{ entity: 'nomor_tugas', option: numbers[0] }] 
            };
        }
    }

    // 9. EDIT JADWAL
    if (isSchedule && isEdit) {
        const numbers = cleanText.match(/\d+/); // Ambil angka pertama sebagai ID
        if (numbers) {
            return { 
                intent: 'jadwal.edit', 
                score: 1.0, 
                entities: [{ entity: 'nomor_jadwal', option: numbers[0] }] 
            };
        }
    }

        // ==========================================================
        // LAYER 2: AI / NLP MODEL
        // Jika tidak ada hard rules yang cocok, gunakan NLP
        // ==========================================================
        
        let result = { intent: 'None', score: 0 };
        
        if (isModelLoaded) {
            result = await manager.process('id', cleanText);
        }

        // ==========================================================
        // LAYER 3: FALLBACKS & SMALL TALK
        // ==========================================================

        // Deteksi tawa (Fitur seru dari HEAD)
        if (cleanText.match(/(wkwk|haha|huhu|kocak|lucu|anjir|awok|xixi)/)) {
            return { intent: 'chat.tawa', score: 1.0, answer: "Wkwk bisa aja lu bang! 😂" };
        }

        // Sapaan sederhana (Fitur dari Incoming)
        if (result.score < 0.5 && ['p', 'bot', 'min', 'halo', 'hai', 'assalamualaikum'].some(s => cleanText.includes(s))) {
            return { 
                intent: 'obrolan.bebas', 
                score: 1.0, 
                answer: "Halo! Ketik *!menu* untuk melihat apa yang bisa aku bantu ya. 👋" 
            };
        }

        return result;
    };

    // EKSPOR LENGKAP
    module.exports = { init, processText };