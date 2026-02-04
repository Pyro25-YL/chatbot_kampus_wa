// lib/logic_chat.js
const { trackMenuList, trackTutorialList, buildMenuCategoryListText, buildTutorialCategoryListText } = require('./menu');

const handleChatLogic = async (intent, context) => {
    const { msg, result, idGrup } = context;

    switch (intent) {
        // --- MENU & NAVIGASI ---
        case 'menu.lihat':
            await msg.reply(buildMenuCategoryListText());
            trackMenuList(idGrup);
            break;
        
        case 'tutorial.lihat':
            await msg.reply(buildTutorialCategoryListText());
            trackTutorialList(idGrup);
            break;

        // --- OBROLAN SANTAI ---
        case 'chat.tawa':
        case 'obrolan.bebas':
            // Ambil jawaban dari AI (Layer 3 di ai.js)
            if (result.answer) {
                msg.reply(result.answer);
            } else {
                msg.reply("Halo! Ada yang bisa dibantu? 😄");
            }
            break;

        // --- FALLBACK (GAK NGERTI) ---
        default:
            // Jika ada jawaban bawaan dari model NLP
            if (result.answer) {
                msg.reply(result.answer);
            } else {
                msg.reply("Hadir bos! Ada yang bisa dibantu? Ketik 'Menu' kalau bingung. 🫡");
            }
            break;
    }
};

module.exports = { handleChatLogic };