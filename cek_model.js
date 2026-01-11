const https = require('https');

// --- PASTE API KEY DI SINI ---
const API_KEY = "AIzaSyCiZkdgV9GqXmf_hashkR7Fp-6sSw9mT1I"; 
// -----------------------------

const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`;

console.log("📡 Menghubungi Google via HTTPS Bawaan...");

https.get(url, (res) => {
    let data = '';

    // Ambil data potong-potong (chunk)
    res.on('data', (chunk) => {
        data += chunk;
    });

    // Setelah data lengkap diterima
    res.on('end', () => {
        console.log(`\n📊 Status Code: ${res.statusCode}`);
        
        try {
            const json = JSON.parse(data);
            
            if (json.error) {
                console.log("❌ ERROR DARI GOOGLE:");
                console.log(JSON.stringify(json.error, null, 2));
            } else if (json.models) {
                console.log("✅ SUKSES! DAFTAR MODEL YANG TERSEDIA:");
                console.log("-------------------------------------");
                const geminiModels = json.models.filter(m => m.name.includes('gemini'));
                
                if (geminiModels.length > 0) {
                    geminiModels.forEach(m => {
                        console.log(`👉 ${m.name.replace('models/', '')}`);
                    });
                    console.log("-------------------------------------");
                    console.log("Tips: Copy salah satu nama di atas (misal: gemini-pro) ke index.js");
                } else {
                    console.log("⚠️ Tidak ada model Gemini ditemukan. List semua:");
                    console.log(json.models);
                }
            } else {
                console.log("⚠️ Respon aneh:", data);
            }
        } catch (e) {
            console.log("❌ Gagal baca JSON:", e.message);
            console.log("Data mentah:", data);
        }
    });

}).on("error", (err) => {
    console.log("❌ ERROR KONEKSI INTERNET:", err.message);
});