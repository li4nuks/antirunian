const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const app = express();

app.use(express.json());

const token = process.env.TELEGRAM_TOKEN;
const bot = new TelegramBot(token); 

app.post('/webhook', async (req, res) => {
    try {
        const body = req.body;
        
        // Универсальное извлечение сообщения с защитой от пустых объектов
        const msg = body.message || body.channel_post || body.edited_message || body.edited_channel_post;

        if (msg && msg.chat && msg.message_id) {
            let shouldDelete = false;

            // 1. Безопасная проверка на автора сообщения (для обычных пользователей)
            if (msg.from && msg.from.username) {
                const username = msg.from.username.toLowerCase();
                if (username === 'sglypa_tg_bot') {
                    shouldDelete = true;
                }
            }

            // 2. Ловим сообщения от @sglypa_tg_bot, если их КТО-ТО ПЕРЕСЛАЛ в группу
            if (msg.forward_from && msg.forward_from.username) {
                if (msg.forward_from.username.toLowerCase() === 'sglypa_tg_bot') {
                    shouldDelete = true;
                }
            }

            // 3. Проверка текста и подписей к медиа (РУНИАН)
            const fullText = (msg.text || msg.caption || '').toLowerCase();
            if (fullText.includes('руниан')) {
                shouldDelete = true;
            }

            // 4. Проверка скрытых форматированных ссылок
            const allEntities = msg.entities || msg.caption_entities || [];
            for (const entity of allEntities) {
                if (entity.type === 'text_link' && entity.url) {
                    if (entity.url.toLowerCase().includes('runianews')) {
                        shouldDelete = true;
                        break;
                    }
                }
            }

            // 5. Проверка метаданных пересылки каналов
            if (msg.forward_from_chat && msg.forward_from_chat.username) {
                if (msg.forward_from_chat.username.toLowerCase() === 'runianews') {
                    shouldDelete = true;
                }
            }
            if (msg.forward_origin && msg.forward_origin.chat && msg.forward_origin.chat.username) {
                if (msg.forward_origin.chat.username.toLowerCase() === 'runianews') {
                    shouldDelete = true;
                }
            }

            // Если сработало хоть одно условие — удаляем сообщение
            if (shouldDelete) {
                try {
                    await bot.deleteMessage(msg.chat.id, msg.message_id);
                    
                    // Уведомление отправляем ТОЛЬКО если это не пересылка бота sglypa
                    const isFromSglypa = msg.from && msg.from.username && msg.from.username.toLowerCase() === 'sglypa_tg_bot';
                    const isForwardedSglypa = msg.forward_from && msg.forward_from.username && msg.forward_from.username.toLowerCase() === 'sglypa_tg_bot';
                    
                    if (!isFromSglypa && !isForwardedSglypa) {
                        await bot.sendMessage(msg.chat.id, 'Сообщение из запрещенного канала удалено.');
                    }
                } catch (e) {
                    console.error('Не удалось удалить сообщение:', e.message);
                }
            }
        }
        
        // ВСЕГДА отвечаем Telegram 'ok', чтобы он не спамил вебхуками
        res.send('ok');
    } catch (err) {
        console.error('Критическая ошибка вебхука:', err);
        // Даже при ошибке возвращаем статус, чтобы Render не падал
        res.status(200).send('error_logged');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
