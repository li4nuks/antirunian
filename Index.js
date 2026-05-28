const express = require('express');
const TelegramBot = require('node-telegram-bot-api'); 
const app = express();

app.use(express.json());

// Инициализация вашего бота (токен берется из переменных окружения Render)
const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token); 

// Исправленный вебхук с таргетом на одного пользователя:
app.post('/webhook', async (req, res) => {
    try {
        const body = req.body
        const msg = body.message || body.channel_post || body.edited_message || body.edited_channel_post

        if (msg) {
            // Безопасно проверяем, что сообщение отправил именно @Poligraphsh
            const isTargetUser = msg.from && msg.from.username && msg.from.username.toLowerCase() === 'poligraphsh';

            // Если это нужный пользователь, запускаем проверки на запрещенный контент
            if (isTargetUser) {
                let shouldDelete = false
                const fullText = (msg.text || msg.caption || '').toLowerCase()

                if (fullText.includes('руниан')) {
                    shouldDelete = true
                }

                const allEntities = msg.entities || msg.caption_entities || []
                for (const entity of allEntities) {
                    if (entity.type === 'text_link' && entity.url) {
                        if (entity.url.toLowerCase().includes('runianews')) {
                            shouldDelete = true
                            break
                        }
                    }
                }

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

                // Удаляем, если условия совпали
                if (shouldDelete) {
                    try {
                        await bot.deleteMessage(msg.chat.id, msg.message_id)
                        await bot.sendMessage(msg.chat.id, 'Сообщение из запрещенного канала удалено.')
                    } catch (e) {
                        console.error('Не удалось удалить сообщение:', e.message)
                    }
                }
            }
        }
        res.send('ok')
    } catch (err) {
        console.error('Ошибка вебхука:', err)
        res.send('error')
    }
});

// Запуск сервера на порту Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
