// Jalankan script singkat ini di Node.js kamu
const API_KEY = "AQ.Ab8RN6IEkM68rz6djAa4ek6bzNsohDH525XGBx1ZZTVkd-R8Pw";

async function checkGeminiModels() {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`);
  const data = await res.json();
  
  if (data.models) {
    console.log("✅ Model Gemini yang tersedia:");
    data.models.forEach(m => {
      // Filter hanya model yang mendukung generateContent
      if (m.supportedGenerationMethods.includes("generateContent")) {
        console.log(`- ${m.name.replace('models/', '')}`);
      }
    });
  } else {
    console.log("❌ Error:", data);
  }
}

checkGeminiModels();