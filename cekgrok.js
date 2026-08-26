const GROK_KEY = "xai-O2MrGiX3ubMKMJR0Geaymfzp3rWB3NFrtS6RilrUp3lnmoNFMvlQJni7Ik0YjbFIiz3agcKn2M9hJ4Xk";

async function checkGrokModels() {
  const res = await fetch("https://api.x.ai/v1/models", {
    headers: { "Authorization": `Bearer ${GROK_KEY}` }
  });
  const data = await res.json();
  if (data.data) {
    console.log("✅ Model Grok yang Aktif:");
    data.data.forEach(m => console.log(`- ${m.id}`));
  } else {
    console.log("❌ Error Grok:", data);
  }
}

checkGrokModels();