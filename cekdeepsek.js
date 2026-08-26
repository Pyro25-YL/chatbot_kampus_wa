const DEEPSEEK_KEY = "sk-799c513eefea48b49916133b931a8b12";

async function checkDeepSeekModels() {
  const res = await fetch("https://api.deepseek.com/models", {
    headers: { "Authorization": `Bearer ${DEEPSEEK_KEY}` }
  });
  const data = await res.json();
  console.log("✅ Model DeepSeek:", data);
}

checkDeepSeekModels();