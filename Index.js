const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { MongoClient } = require('mongodb');

const app = express();
app.use(express.json());

const token = process.env.BOT_TOKEN;
const MONGO_URI = process.env.MONGO_URI;

const bot = new TelegramBot(token);

// ─── MongoDB ──────────────────────────────────────────────────────────────────
let db = null;

async function connectDB() {
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    db = client.db('zapretbot');
    console.log('MongoDB подключена');
}

// Коллекция data: один документ { _id: 'main', bans: {}, allBans: [], deletionTime: 10 }
async function loadData() {
    const doc = await db.collection('data').findOne({ _id: 'main' });
    if (!doc) return { bans: {}, allBans: [], deletionTime: 10 };
    return doc;
}

async function saveData(data) {
    await db.collection('data').replaceOne(
        { _id: 'main' },
        { _id: 'main', ...data },
        { upsert: true }
    );
}

// Коллекция vlasti: один документ { _id: 'main', list: [] }
async function loadVlasti() {
    const doc = await db.collection('vlasti').findOne({ _id: 'main' });
    return (doc && doc.list) ? doc.list : [];
}

// ─── Проверка прав ───────────────────────────────────────────────────────────
async function isVlast(msg) {
    const vlasti = await loadVlasti();
    const username = (msg.from && msg.from.username) ? msg.from.username.toLowerCase() : null;
    const id = msg.from && msg.from.id ? msg.from.id.toString() : null;
    return vlasti.some(v => {
        const vl = v.toString().toLowerCase().replace('@', '');
        return (username && username === vl) || (id && id === v.toString());
    });
}

// ─── Типы запретов ───────────────────────────────────────────────────────────
const BAN_TYPES = {
    '1': 'стикеры',
    '2': 'гиф',
    '3': 'слово/текст',
    '4': 'фото',
    '5': 'видео'
};

// ─── Парсинг аргументов ──────────────────────────────────────────────────────
function parseArgs(text) {
    const args = [];
    const regex = /"([^"]+)"|(\S+)/g;
    let m;
    while ((m = regex.exec(text)) !== null) {
        args.push(m[1] !== undefined ? m[1] : m[2]);
    }
    return args;
}

function resolveUserKey(userArg) {
    return userArg.replace('@', '').toLowerCase();
}

function formatBanEntry(banObj) {
    if (banObj.type === '3') {
        return banObj.word ? `слово/символ (${banObj.word})` : 'текстовые сообщения';
    }
    return BAN_TYPES[banObj.type] || banObj.type;
}

// ─── Удаление warn-сообщений через deletionTime ──────────────────────────────
async function scheduleDelete(chatId, messageId) {
    const data = await loadData();
    const delay = (data.deletionTime || 10) * 1000;
    setTimeout(async () => {
        try { await bot.deleteMessage(chatId, messageId); } catch {}
    }, delay);
}

// ─── Проверка нарушений ──────────────────────────────────────────────────────
function checkViolation(msg, userKey, data) {
    const userBans = data.bans[userKey] || [];
    const allBans  = data.allBans || [];
    const combined = [...allBans, ...userBans];
    const fullText = (msg.text || msg.caption || '').toLowerCase().trim();

    for (const ban of combined) {
        switch (ban.type) {
            case '1': if (msg.sticker)  return 'Стикеры запрещены для вас.'; break;
            case '2': if (msg.animation) return 'Гифки запрещены для вас.'; break;
            case '3':
                if (ban.word) {
                    if (fullText.includes(ban.word.toLowerCase()))
                        return `Слово/символ "${ban.word}" запрещено для вас.`;
                } else {
                    if (msg.text || msg.caption) return 'Текстовые сообщения запрещены для вас.';
                }
                break;
            case '4': if (msg.photo)  return 'Фотографии запрещены для вас.'; break;
            case '5': if (msg.video || msg.video_note) return 'Видео запрещено для вас.'; break;
        }
    }
    return null;
}

// ─── Вебхук ──────────────────────────────────────────────────────────────────
app.post('/webhook', async (req, res) => {
    res.send('ok');
    try {
        const body = req.body;
        const msg  = body.message || body.channel_post || body.edited_message || body.edited_channel_post;
        if (!msg) return;

        const chatId  = msg.chat.id;
        const text    = (msg.text || msg.caption || '').trim();
        const textLow = text.toLowerCase();

        // /zapreti — список типов (для всех)
        if (textLow.startsWith('/zapreti')) {
            const list = Object.entries(BAN_TYPES).map(([id, name]) => `${id}. ${name}`).join('\n');
            await bot.sendMessage(chatId, `Доступные типы запретов:\n${list}`);
            return;
        }

        // /zapret — активные запреты (для всех)
        if (textLow.startsWith('/zapret')) {
            const data = await loadData();
            let out = 'Все:\n';
            const allBans = data.allBans || [];
            out += allBans.length === 0 ? 'Нет запретов\n' : allBans.map(b => formatBanEntry(b)).join(', ') + '\n';

            const bans = data.bans || {};
            for (const [user, userBans] of Object.entries(bans)) {
                if (!userBans || userBans.length === 0) continue;
                out += `\n@${user}:\n${userBans.map(b => formatBanEntry(b)).join(', ')}\n`;
            }
            await bot.sendMessage(chatId, out.trim() || 'Запретов нет.');
            return;
        }

        // /vlasti — список властей (для всех)
        if (textLow.startsWith('/vlasti')) {
            const vlasti = await loadVlasti();
            if (vlasti.length === 0) {
                await bot.sendMessage(chatId, 'Список властей пуст.');
            } else {
                await bot.sendMessage(chatId, 'Власти:\n' + vlasti.map(v => `• ${v}`).join('\n'));
            }
            return;
        }

        // /add — добавить запрет (только власти)
        if (textLow.startsWith('/add')) {
            if (!await isVlast(msg)) {
                const w = await bot.sendMessage(chatId, 'У вас нет прав для этой команды.');
                scheduleDelete(chatId, w.message_id);
                return;
            }
            const args = parseArgs(text.slice(4).trim());
            if (args.length < 2) {
                await bot.sendMessage(chatId, 'Использование: /add "юзер" "тип" ["слово"]\nПример: /add "username" "3" "плохоеслово"');
                return;
            }
            const userArg = args[0];
            const banType = args[1];
            const word    = args[2] || null;

            if (!BAN_TYPES[banType]) {
                await bot.sendMessage(chatId, `Неверный тип. Доступные: ${Object.keys(BAN_TYPES).join(', ')}`);
                return;
            }

            const data = await loadData();
            const banObj = { type: banType };
            if (banType === '3' && word) banObj.word = word.toLowerCase();

            if (userArg.toLowerCase() === 'all') {
                data.allBans = data.allBans || [];
                const exists = data.allBans.some(b => b.type === banType && (banType !== '3' || b.word === banObj.word));
                if (!exists) data.allBans.push(banObj);
            } else {
                const key = resolveUserKey(userArg);
                data.bans[key] = data.bans[key] || [];
                const exists = data.bans[key].some(b => b.type === banType && (banType !== '3' || b.word === banObj.word));
                if (!exists) data.bans[key].push(banObj);
            }

            await saveData(data);
            const label = userArg.toLowerCase() === 'all' ? 'всех' : `@${resolveUserKey(userArg)}`;
            await bot.sendMessage(chatId, `✅ Запрет добавлен для ${label}: ${formatBanEntry(banObj)}`);
            return;
        }

        // /rem — убрать запрет (только власти)
        if (textLow.startsWith('/rem')) {
            if (!await isVlast(msg)) {
                const w = await bot.sendMessage(chatId, 'У вас нет прав для этой команды.');
                scheduleDelete(chatId, w.message_id);
                return;
            }
            const args = parseArgs(text.slice(4).trim());
            if (args.length < 2) {
                await bot.sendMessage(chatId, 'Использование: /rem "юзер/all" "тип" ["слово"]');
                return;
            }
            const userArg = args[0];
            const banType = args[1];
            const word    = args[2] ? args[2].toLowerCase() : null;

            const data = await loadData();

            if (userArg.toLowerCase() === 'all') {
                data.allBans = (data.allBans || []).filter(b => {
                    if (b.type !== banType) return true;
                    if (banType === '3') return word ? b.word !== word : (b.word !== undefined && b.word !== null);
                    return false;
                });
            } else {
                const key = resolveUserKey(userArg);
                if (data.bans[key]) {
                    data.bans[key] = data.bans[key].filter(b => {
                        if (b.type !== banType) return true;
                        if (banType === '3') return word ? b.word !== word : (b.word !== undefined && b.word !== null);
                        return false;
                    });
                    if (data.bans[key].length === 0) delete data.bans[key];
                }
            }

            await saveData(data);
            const label = userArg.toLowerCase() === 'all' ? 'всех' : `@${resolveUserKey(userArg)}`;
            await bot.sendMessage(chatId, `✅ Запрет снят для ${label}: тип ${BAN_TYPES[banType] || banType}${word ? ` (${word})` : ''}`);
            return;
        }

        // /zapretit — бан (только власти)
        if (textLow.startsWith('/zapretit')) {
            if (!await isVlast(msg)) {
                const w = await bot.sendMessage(chatId, 'У вас нет прав для этой команды.');
                scheduleDelete(chatId, w.message_id);
                return;
            }

            let targetId = null, targetName = null;

            if (msg.reply_to_message) {
                targetId   = msg.reply_to_message.from.id;
                targetName = msg.reply_to_message.from.username
                    ? `@${msg.reply_to_message.from.username}`
                    : msg.reply_to_message.from.first_name;
            } else {
                const args = parseArgs(text.slice(9).trim());
                if (args.length < 1) {
                    await bot.sendMessage(chatId, 'Использование: /zapretit "юзер" или ответьте на сообщение.');
                    return;
                }
                const uArg = args[0].replace('@', '');
                try {
                    const member = await bot.getChatMember(chatId, '@' + uArg);
                    targetId   = member.user.id;
                    targetName = `@${uArg}`;
                } catch {
                    await bot.sendMessage(chatId, `Не удалось найти @${uArg} в этом чате.`);
                    return;
                }
            }

            try {
                await bot.banChatMember(chatId, targetId);
                await bot.sendMessage(chatId, `🔨 Пользователь ${targetName} забанен.`);
            } catch (e) {
                await bot.sendMessage(chatId, `Не удалось забанить: ${e.message}`);
            }
            return;
        }

        // /kddel — время удаления warn-сообщений (только власти)
        if (textLow.startsWith('/kddel')) {
            if (!await isVlast(msg)) {
                const w = await bot.sendMessage(chatId, 'У вас нет прав для этой команды.');
                scheduleDelete(chatId, w.message_id);
                return;
            }
            const rawArgs = text.slice(6).trim();
            const data = await loadData();
            if (!rawArgs) {
                data.deletionTime = 10;
                await saveData(data);
                await bot.sendMessage(chatId, '⏱ Время удаления сброшено до 10 секунд.');
            } else {
                const secs = parseInt(rawArgs, 10);
                if (isNaN(secs) || secs < 1) {
                    await bot.sendMessage(chatId, 'Укажите корректное число секунд.');
                    return;
                }
                data.deletionTime = secs;
                await saveData(data);
                await bot.sendMessage(chatId, `⏱ Время удаления предупреждений: ${secs} сек.`);
            }
            return;
        }

        // ════════════════════════════════════════════════════════════════════
        // ПРОВЕРКА НАРУШЕНИЙ
        // ════════════════════════════════════════════════════════════════════
        if (!msg.from) return;

        const senderUsername = msg.from.username ? msg.from.username.toLowerCase() : null;
        const senderId       = msg.from.id.toString();
        const data = await loadData();

        let userKey = null;
        if (senderUsername && data.bans[senderUsername]) {
            userKey = senderUsername;
        } else if (data.bans[senderId]) {
            userKey = senderId;
        } else {
            userKey = senderUsername || senderId;
        }

        const violationText = checkViolation(msg, userKey, data);
        if (violationText) {
            try {
                await bot.deleteMessage(chatId, msg.message_id);
                const warn = await bot.sendMessage(chatId, violationText);
                scheduleDelete(chatId, warn.message_id);
            } catch (e) {
                console.error('Ошибка при удалении:', e.message);
            }
        }

    } catch (err) {
        console.error('Ошибка вебхука:', err);
    }
});

// ─── Старт ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

connectDB().then(() => {
    app.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));
}).catch(err => {
    console.error('Не удалось подключиться к MongoDB:', err);
    process.exit(1);
});
