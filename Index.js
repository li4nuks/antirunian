const express = require('express');
const TelegramBot = require('node-telegram-bot-api'); 
const app = express();

app.use(express.json());

// Инициализация вашего бота (токен берется из переменных окружения Render)
const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token); 

app.post('/webhook', async (req, res) => {
    try {
        const body = req.body
        const msg = body.message || body.channel_post || body.edited_message || body.edited_channel_post

        if (msg) {
            let shouldDelete = false
            let alertText = 'Сообщение из запрещенного канала удалено.';

            // 1. Проверяем, входит ли отправитель в список "нарушителей" (по юзернейму или по ID)
            const hasUsername = msg.from && msg.from.username && msg.from.username.toLowerCase() === 'poligraphsh';
            const hasUserId = msg.from && msg.from.id && msg.from.id.toString() === '8482235186';

            // Ограничения срабатывают ТОЛЬКО если это один из двух целевых пользователей
            if (hasUsername || hasUserId) {
                
                // Извлекаем текст и подписи к медиа для проверок текста
                const fullText = (msg.text || msg.caption || '').toLowerCase()

                // 2. Проверка на букву "Ъ"
                if (fullText.includes('ъ')) {
                    shouldDelete = true
                    alertText = 'Буква "Ъ" запрещена для вас в этом чате.'
                }

                // 3. Проверка на гифку (animation) или стикер (sticker)
                if (!shouldDelete) {
                    if (msg.animation) {
                        shouldDelete = true
                        alertText = 'Гифки от этого пользователя запрещены.'
                    } else if (msg.sticker) {
                        shouldDelete = true
                        alertText = 'Стикеры от этого пользователя запрещены.'
                    }
                }

                // 4. Проверка текста на стоп-слово "руниан"
                if (!shouldDelete && fullText.includes('руниан')) {
                    shouldDelete = true
                }

                // 5. Проверка скрытых ссылок в тексте или медиа
                if (!shouldDelete) {
                    const allEntities = msg.entities || msg.caption_entities || []
                    for (const entity of allEntities) {
                        if (entity.type === 'text_link' && entity.url) {
                            if (entity.url.toLowerCase().includes('runianews')) {
                                shouldDelete = true
                                break
                            }
                        }
                    }
                }

                // 6. Проверка метаданных пересылки из канала
                if (!shouldDelete) {
                    if (msg.forward_from_chat && msg.forward_from_chat.username) {
                        if (msg.forward_from_chat.username.toLowerCase() === 'runianews') {
                            shouldDelete = true
                        }
                    }
                    if (msg.forward_origin && msg.forward_origin.chat && msg.forward_origin.chat.username) {
                        if (msg.forward_origin.chat.username.toLowerCase() === 'runianews') {
                            shouldDelete = true
                        }
                    }
                }

                // --- БЛОК УДАЛЕНИЯ И ТАЙМЕРА ---
                if (shouldDelete) {
                    try {
                        // Удаляем запрещенное сообщение
                        await bot.deleteMessage(msg.chat.id, msg.message_id)
                        
                        // Отправляем предупреждение
                        const sentMsg = await bot.sendMessage(msg.chat.id, alertText)
                        
                        // Автоматически удаляем предупреждение бота через 10 секунд
                        setTimeout(async () => {
                            try {
                                await bot.deleteMessage(sentMsg.chat.id, sentMsg.message_id)
                            } catch (err) {
                                console.error('Не удалось удалить предупреждение бота:', err.message)
                            }
                        }, 10000);

                    } catch (e) {
                        console.error('Не удалось обработать удаление:', e.message)
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
