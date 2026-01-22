const fs = require('fs');

// --- DATABASE KATA ---
const subjects = ["aku", "saya", "gw", "gue", "ane", "kita", "bantu", "tolong", "cuy", "min", "bot", "gan", "bro"];
const verbs = ["minta", "kasih", "liat", "cek", "cari", "tambah", "input", "masukin", "hapus", "buang", "ganti", "edit"];
const objects = ["tugas", "pr", "jadwal", "matkul", "nilai", "khs", "krs", "skripsi", "dosen", "ruangan", "biaya", "ukt"];
const matkuls = ["Matematika", "Fisika", "Kimia", "Biologi", "Algoritma", "Basis Data", "Jaringan", "AI", "Kalkulus", "Statistika", "Pancasila", "Bahasa Inggris", "Etika Profesi", "Pemrograman Web", "Mobile Dev"];
const times = ["hari ini", "besok", "lusa", "minggu depan", "sekarang", "nanti sore", "pagi ini", "nanti malam", "secepatnya"];
const fillers = ["dong", "cepeteran", "bisa ga", "plis", "tolonglah", "woy", "min", "gan", "kak", "boss"];

// --- TEMPLATE INTENT ---
const intents = [
    { name: "sapaan.halo", keywords: ["halo", "hai", "p", "test", "assalamualaikum", "woy", "min", "pagi", "siang", "malam"] },
    { name: "tugas.tambah", keywords: ["tambah tugas", "pr baru", "ada tugas", "input tugas", "catet tugas"] },
    { name: "tugas.lihat", keywords: ["lihat tugas", "cek pr", "list tugas", "ada pr apa", "tugas gw"] },
    { name: "jadwal.lihat", keywords: ["jadwal kuliah", "matkul hari ini", "cek jadwal", "kuliah apa", "masuk jam berapa"] },
    { name: "akademik.nilai", keywords: ["nilai", "ipk", "khs", "transkrip", "hasil studi"] },
    { name: "obrolan.curhat", keywords: ["capek", "pusing", "lelah", "galau", "stress", "pengen nikah", "skripsi susah"] }
];

// --- FUNGSI RANDOM ---
function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function generateSentence(intentType) {
    const s = pick(subjects);
    const v = pick(verbs);
    const o = pick(objects);
    const m = pick(matkuls);
    const t = pick(times);
    const f = pick(fillers);

    if (intentType.includes("tugas.tambah")) {
        return `${v} ${o} ${m} ${t} ${f}`;
    } else if (intentType.includes("tugas.lihat")) {
        return `${v} ${o} ${m} ${f}`;
    } else if (intentType.includes("jadwal")) {
        return `${o} ${m} ${t} jam berapa`;
    } else if (intentType.includes("sapaan")) {
        return `${pick(intents[0].keywords)} ${f}`;
    } else {
        return `${s} ${v} ${o} ${f}`;
    }
}

// --- GENERATOR UTAMA ---
const TOTAL_DATA = 100000; // JUMLAH DATA
const data = [];

// Buat struktur dasar Intent
intents.forEach(i => {
    data.push({
        intent: i.name,
        utterances: [],
        answers: ["Respon default untuk " + i.name] // Placeholder jawaban
    });
});

console.log(`🚀 Sedang mencetak ${TOTAL_DATA} kalimat...`);

for (let i = 0; i < TOTAL_DATA; i++) {
    // Pilih intent secara acak
    const randomIntentIndex = Math.floor(Math.random() * intents.length);
    const selectedIntent = intents[randomIntentIndex];
    
    // Generate kalimat unik
    let sentence = generateSentence(selectedIntent.name);
    
    // Tambahkan variasi random string di ujung biar unik 100%
    sentence += ` [id:${Math.random().toString(36).substring(7)}]`; 

    // Masukkan ke array utterances
    data[randomIntentIndex].utterances.push(sentence);
}

// --- OUTPUT JSON ---
const finalJson = {
    name: "KampusBot_Monster_100k",
    locale: "id-ID",
    data: data
};

fs.writeFileSync('corpus_100k2.json', JSON.stringify(finalJson, null, 2));
console.log("✅ SELESAI! File 'corpus_100k.json' berhasil dibuat.");