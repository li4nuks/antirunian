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
            // Извлекаем текст сообщения для проверок
            const fullText = (msg.text || msg.caption || '').toLowerCase().trim()

            // 1. Проверка на команду /zapret (работает для всех, сообщения НЕ удаляются)
            if (fullText.startsWith('/zapret')) {
                try {
                    await bot.sendMessage(msg.chat.id, 'Список запретов:\n@Poligraphsh - гиф, твердый знак\n8482235186 (Сталин) - гиф, стикеры, твердый знак\n@STEKL_q - 67, упоминание @MrKafych @fivishi\n@speqooo - отправлять сообщения')
                } catch (e) {
                    console.error('Не удалось ответить на команду /zapret:', e.message)
                }
                return res.send('ok')
            }

            let shouldDelete = false
            let alertText = 'Сообщение из запрещенного канала удалено.';

            // Идентифицируем пользователей
            const isPoligraphsh = msg.from && msg.from.username && msg.from.username.toLowerCase() === 'poligraphsh';
            const isSecondUser = msg.from && msg.from.id && msg.from.id.toString() === '8482235186';
            const isSteklQ = msg.from && msg.from.username && msg.from.username.toLowerCase() === 'stekl_q';
            const isSpeqooo = msg.from && msg.from.username && msg.from.username.toLowerCase() === 'speqooo';

            // --- ПРОВЕРКА ДЛЯ @speqooo (ПОЛНЫЙ ЗАПРЕТ НА ВСЁ) ---
            if (isSpeqooo) {
                shouldDelete = true
                alertText = 'Вам запрещено отправлять сообщения в этот чат.'
            }

            // --- ПРОВЕРКА ДЛЯ @STEKL_q ---
            if (isSteklQ && !shouldDelete) {
                // Проверка на число 67
                if (fullText.includes('67')) {
                    shouldDelete = true
                    alertText = 'Число "67" запрещено для вас в этом чате.'
                }

                // Проверка на запрещенные юзернеймы
                if (!shouldDelete && (fullText.includes('@mrkafych') || fullText.includes('@fivishi'))) {
                    shouldDelete = true
                    alertText = 'Упоминание этих пользователей запрещено для вас.'
                }

                // Дополнительная проверка текстовых упоминаний через entities
                if (!shouldDelete) {
                    const allEntities = msg.entities || msg.caption_entities || []
                    for (const entity of allEntities) {
                        if (entity.type === 'mention') {
                            const mentionText = fullText.substring(entity.offset, entity.offset + entity.length);
                            if (mentionText === '@mrkafych' || mentionText === '@fivishi') {
                                shouldDelete = true;
                                alertText = 'Упоминание этих пользователей запрещено для вас.';
                                break;
                            }
                        }
                    }
                }
            }

            // --- ПРОВЕРКА ДЛЯ @Poligraphsh И ВТОРОГО ПОЛЬЗОВАТЕЛЯ ---
            if ((isPoligraphsh || isSecondUser) && !shouldDelete) {

                // Проверка на букву "Ъ"
                if (fullText.includes('ъ')) {
                    shouldDelete = true
                    alertText = 'Буква "Ъ" запрещена для вас в этом чате.'
                }

                // Проверка на гифку
                if (!shouldDelete && msg.animation) {
                    shouldDelete = true
                    alertText = 'Гифки от этого пользователя запрещены.'
                }

                // Проверка на стикер (ТОЛЬКО для второго пользователя)
                if (!shouldDelete && msg.sticker && isSecondUser) {
                    shouldDelete = true
                    alertText = 'Стикеры от этого пользователя запрещены.'
                }

                // Проверка текста на стоп-слово "руниан"
                if (!shouldDelete && fullText.includes('руниан')) {
                    shouldDelete = true
                }

                // Проверка скрытых ссылок
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

                // Проверка метаданных пересылки
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
