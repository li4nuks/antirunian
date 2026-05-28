const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const app = express();

app.use(express.json());

// Инициализация бота (токен берется из переменных окружения Render)
const token = process.env.TELEGRAM_TOKEN;
const bot = new TelegramBot(token); 

app.post('/webhook', async (req, res) => {
    try {
        const body = req.body
        const msg = body.message || body.channel_post || body.edited_message || body.edited_channel_post

        if (msg) {
            let shouldDelete = false

            // 1. Проверка на сообщения от конкретного бота (@sglypa_tg_bot)
            if (msg.from && msg.from.username) {
                if (msg.from.username.toLowerCase() === 'sglypa_tg_bot') {
                    shouldDelete = true
                }
            }

            // 2. Собираем текст и подписи к медиа
            const fullText = (msg.text || msg.caption || '').toLowerCase()
            if (fullText.includes('руниан')) {
                shouldDelete = true
            }

            // 3. Проверяем скрытые ссылки в тексте и картинках
            const allEntities = msg.entities || msg.caption_entities || []
            for (const entity of allEntities) {
                if (entity.type === 'text_link' && entity.url) {
                    if (entity.url.toLowerCase().includes('runianews')) {
                        shouldDelete = true
                        break
                    }
                }
            }

            // 4. Проверка метаданных пересылки
            if (msg.forward_from_chat) {
                const chat = msg.forward_from_chat
                if (chat.username && chat.username.toLowerCase() === 'runianews') {
                    shouldDelete = true
                }
            }
            if (msg.forward_origin && msg.forward_origin.chat) {
                const chat = msg.forward_origin.chat
                if (chat.username && chat.username.toLowerCase() === 'runianews') {
                    shouldDelete = true
                }
            }

            // Удаление при совпадении любых условий
            if (shouldDelete) {
                try {
                    await bot.deleteMessage(msg.chat.id, msg.message_id)
                    
                    // Отправляем уведомление только если это НЕ сообщение от бота sglypa_tg_bot
                    // Чтобы избежать лишнего спама в группе
                    const isSglypa = msg.from && msg.from.username && msg.from.username.toLowerCase() === 'sglypa_tg_bot';
                    if (!isSglypa) {
                        await bot.sendMessage(msg.chat.id, 'Сообщение удалено.')
                    }
                } catch (e) {
                    console.error('Не удалось удалить сообщение:', e.message)
                }
            }
        }
        res.send('ok')
    } catch (err) {
        console.error('Ошибка вебхука:', err)
        res.send('error')
    }
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
