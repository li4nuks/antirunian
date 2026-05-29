const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token);

// ─── Пути к файлам ───────────────────────────────────────────────────────────
const DATA_PATH   = path.join(__dirname, 'data.json');
const VLASTI_PATH = path.join(__dirname, 'vlasti.json');

// ─── Хелперы чтения/записи ───────────────────────────────────────────────────
function loadData() {
    try {
        return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    } catch {
        return { bans: {}, allBans: [], deletionTime: 10 };
    }
}

function saveData(data) {
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function loadVlasti() {
    try {
        return JSON.parse(fs.readFileSync(VLASTI_PATH, 'utf8')).vlasti || [];
    } catch {
        return [];
    }
}

// ─── Проверка прав ───────────────────────────────────────────────────────────
function isVlast(msg) {
    const vlasti = loadVlasti();
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

// ─── Парсинг аргументов команды (учитывает кавычки) ──────────────────────────
function parseArgs(text) {
    const args = [];
    const regex = /"([^"]+)"|(\S+)/g;
    let m;
    while ((m = regex.exec(text)) !== null) {
        args.push(m[1] !== undefined ? m[1] : m[2]);
    }
    return args;
}

// ─── Разрешение юзера: username → ключ хранения ──────────────────────────────
function resolveUserKey(userArg) {
    // убираем @ если есть, возвращаем нижний регистр
    return userArg.replace('@', '').toLowerCase();
}

// ─── Форматирование одного запрета для вывода ────────────────────────────────
function formatBanEntry(banObj) {
    // banObj: { type: '3', word: 'слово' } или { type: '1' }
    const label = BAN_TYPES[banObj.type] || banObj.type;
    if (banObj.type === '3') {
        return banObj.word ? `слово/символ (${banObj.word})` : 'текстовые сообщения';
    }
    return label;
}

// ─── Удаление сообщения бота через deletionTime (только для warn-сообщений) ──
function scheduleDelete(chatId, messageId) {
    const data = loadData();
    const delay = (data.deletionTime || 10) * 1000;
    setTimeout(async () => {
        try { await bot.deleteMessage(chatId, messageId); } catch {}
    }, delay);
}

// ─── Проверяет, нарушает ли сообщение запреты пользователя ───────────────────
function checkViolation(msg, userKey, data) {
    const userBans = data.bans[userKey] || [];
    const allBans  = data.allBans || [];
    const combined = [...allBans, ...userBans];

    const fullText = (msg.text || msg.caption || '').toLowerCase().trim();

    for (const ban of combined) {
        switch (ban.type) {
            case '1':
                if (msg.sticker) return `Стикеры запрещены для вас.`;
                break;
            case '2':
                if (msg.animation) return `Гифки запрещены для вас.`;
                break;
            case '3':
                if (ban.word) {
                    if (fullText.includes(ban.word.toLowerCase())) {
                        return `Слово/символ "${ban.word}" запрещено для вас.`;
                    }
                } else {
                    // блокировка всех текстовых сообщений
                    if (msg.text || msg.caption) return `Текстовые сообщения запрещены для вас.`;
                }
                break;
            case '4':
                if (msg.photo) return `Фотографии запрещены для вас.`;
                break;
            case '5':
                if (msg.video || msg.video_note) return `Видео запрещено для вас.`;
                break;
        }
    }
    return null;
}

// ─── Вебхук ──────────────────────────────────────────────────────────────────
app.post('/webhook', async (req, res) => {
    res.send('ok'); // отвечаем сразу, чтобы Telegram не повторял запрос
    try {
        const body = req.body;
        const msg  = body.message || body.channel_post || body.edited_message || body.edited_channel_post;
        if (!msg) return;

        const chatId   = msg.chat.id;
        const text     = (msg.text || msg.caption || '').trim();
        const textLow  = text.toLowerCase();

        // ════════════════════════════════════════════════════════════════════
        // КОМАНДЫ
        // ════════════════════════════════════════════════════════════════════

        // /zapreti — список типов запретов (для всех)
        if (textLow.startsWith('/zapreti')) {
            const list = Object.entries(BAN_TYPES)
                .map(([id, name]) => `${id}. ${name}`)
                .join('\n');
            await bot.sendMessage(chatId, `Доступные типы запретов:\n${list}`);
            return;
        }

        // /zapret — список активных запретов (для всех)
        if (textLow.startsWith('/zapret')) {
            const data = loadData();
            let out = '';

            // Запреты для всех
            const allBans = data.allBans || [];
            out += 'Все:\n';
            if (allBans.length === 0) {
                out += 'Нет запретов\n';
            } else {
                out += allBans.map(b => formatBanEntry(b)).join(', ') + '\n';
            }

            // Запреты по пользователям
            const bans = data.bans || {};
            for (const [user, userBans] of Object.entries(bans)) {
                if (!userBans || userBans.length === 0) continue;
                out += `\n@${user}:\n`;
                out += userBans.map(b => formatBanEntry(b)).join(', ') + '\n';
            }

            await bot.sendMessage(chatId, out.trim() || 'Запретов нет.');
            return;
        }

        // /vlasti — кто может вносить запреты (для всех)
        if (textLow.startsWith('/vlasti')) {
            const vlasti = loadVlasti();
            if (vlasti.length === 0) {
                await bot.sendMessage(chatId, 'Список властей пуст.');
            } else {
                await bot.sendMessage(chatId, 'Власти:\n' + vlasti.map(v => `• ${v}`).join('\n'));
            }
            return;
        }

        // /add — добавить запрет (только власти)
        if (textLow.startsWith('/add')) {
            if (!isVlast(msg)) {
                const w = await bot.sendMessage(chatId, 'У вас нет прав для этой команды.');
                scheduleDelete(chatId, w.message_id);
                return;
            }
            // убираем команду из строки
            const rawArgs = text.slice(4).trim();
            const args = parseArgs(rawArgs);
            // args[0]=юзер, args[1]=тип, args[2]=слово (опционально)
            if (args.length < 2) {
                const w = await bot.sendMessage(chatId, 'Использование: /add "юзер" "тип" ["слово"]\nПример: /add "username" "3" "плохоеслово"');
                return;
            }

            const userArg = args[0];
            const banType = args[1];
            const word    = args[2] || null;

            if (!BAN_TYPES[banType]) {
                const w = await bot.sendMessage(chatId, `Неверный тип запрета. Доступные: ${Object.keys(BAN_TYPES).join(', ')}`);
                return;
            }

            const data = loadData();
            const banObj = { type: banType };
            if (banType === '3' && word) banObj.word = word.toLowerCase();

            if (userArg.toLowerCase() === 'all') {
                // Запрет для всех
                data.allBans = data.allBans || [];
                // Проверяем дубликат
                const exists = data.allBans.some(b => b.type === banType && (banType !== '3' || b.word === banObj.word));
                if (!exists) data.allBans.push(banObj);
            } else {
                const key = resolveUserKey(userArg);
                data.bans[key] = data.bans[key] || [];
                const exists = data.bans[key].some(b => b.type === banType && (banType !== '3' || b.word === banObj.word));
                if (!exists) data.bans[key].push(banObj);
            }

            saveData(data);
            const label = userArg.toLowerCase() === 'all' ? 'всех' : `@${resolveUserKey(userArg)}`;
            await bot.sendMessage(chatId, `✅ Запрет добавлен для ${label}: ${formatBanEntry(banObj)}`);
            return;
        }

        // /rem — убрать запрет (только власти)
        if (textLow.startsWith('/rem')) {
            if (!isVlast(msg)) {
                const w = await bot.sendMessage(chatId, 'У вас нет прав для этой команды.');
                scheduleDelete(chatId, w.message_id);
                return;
            }
            const rawArgs = text.slice(4).trim();
            const args = parseArgs(rawArgs);
            if (args.length < 2) {
                await bot.sendMessage(chatId, 'Использование: /rem "юзер/all" "тип" ["слово"]');
                return;
            }

            const userArg = args[0];
            const banType = args[1];
            const word    = args[2] ? args[2].toLowerCase() : null;

            const data = loadData();

            if (userArg.toLowerCase() === 'all') {
                data.allBans = (data.allBans || []).filter(b => {
                    if (b.type !== banType) return true;
                    if (banType === '3') return word ? b.word !== word : b.word !== undefined && b.word !== null;
                    return false;
                });
            } else {
                const key = resolveUserKey(userArg);
                if (data.bans[key]) {
                    data.bans[key] = data.bans[key].filter(b => {
                        if (b.type !== banType) return true;
                        if (banType === '3') return word ? b.word !== word : b.word !== undefined && b.word !== null;
                        return false;
                    });
                    if (data.bans[key].length === 0) delete data.bans[key];
                }
            }

            saveData(data);
            const label = userArg.toLowerCase() === 'all' ? 'всех' : `@${resolveUserKey(userArg)}`;
            await bot.sendMessage(chatId, `✅ Запрет снят для ${label}: тип ${BAN_TYPES[banType] || banType}${word ? ` (${word})` : ''}`);
            return;
        }

        // /zapretit — бан пользователя (только власти)
        if (textLow.startsWith('/zapretit')) {
            if (!isVlast(msg)) {
                const w = await bot.sendMessage(chatId, 'У вас нет прав для этой команды.');
                scheduleDelete(chatId, w.message_id);
                return;
            }

            let targetId = null;
            let targetName = null;

            // Если ответ на сообщение — баним автора того сообщения
            if (msg.reply_to_message) {
                targetId   = msg.reply_to_message.from.id;
                targetName = msg.reply_to_message.from.username
                    ? `@${msg.reply_to_message.from.username}`
                    : msg.reply_to_message.from.first_name;
            } else {
                const rawArgs = text.slice(9).trim();
                const args = parseArgs(rawArgs);
                if (args.length < 1) {
                    await bot.sendMessage(chatId, 'Использование: /zapretit "юзер" или ответьте на сообщение.');
                    return;
                }
                // Пытаемся получить ID по username через getChatMember (работает если юзер в чате)
                const uArg = args[0].replace('@', '');
                try {
                    const member = await bot.getChatMember(chatId, '@' + uArg);
                    targetId   = member.user.id;
                    targetName = `@${uArg}`;
                } catch {
                    await bot.sendMessage(chatId, `Не удалось найти пользователя @${uArg} в этом чате.`);
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

        // /kddel — задать время удаления warn-сообщений (только власти)
        if (textLow.startsWith('/kddel')) {
            if (!isVlast(msg)) {
                const w = await bot.sendMessage(chatId, 'У вас нет прав для этой команды.');
                scheduleDelete(chatId, w.message_id);
                return;
            }
            const rawArgs = text.slice(6).trim();
            const data = loadData();
            if (!rawArgs) {
                data.deletionTime = 10;
                saveData(data);
                await bot.sendMessage(chatId, '⏱ Время удаления сброшено до 10 секунд.');
            } else {
                const secs = parseInt(rawArgs, 10);
                if (isNaN(secs) || secs < 1) {
                    await bot.sendMessage(chatId, 'Укажите корректное число секунд.');
                    return;
                }
                data.deletionTime = secs;
                saveData(data);
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

        const data = loadData();

        // Определяем ключ: сначала пробуем username, потом ID
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
