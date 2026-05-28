app.post('/webhook', async (req, res) => {
    try {
        const body = req.body

        // Извлекаем объект сообщения, независимо от его типа
        const msg = body.message || body.channel_post || body.edited_message || body.edited_channel_post

        if (msg) {
            let shouldDelete = false

            // 1. Собираем текст и подписи к медиа
            const fullText = (msg.text || msg.caption || '').toLowerCase()

            if (fullText.includes('руниан')) {
                shouldDelete = true
            }

            // 2. Проверяем скрытые ссылки в тексте и картинках
            const allEntities = msg.entities || msg.caption_entities || []
            
            for (const entity of allEntities) {
                if (entity.type === 'text_link' && entity.url) {
                    if (entity.url.toLowerCase().includes('runianews')) {
                        shouldDelete = true
                        break
                    }
                }
            }

            // 3. Проверка метаданных пересылки
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

            // Удаление при совпадении условий
            if (shouldDelete) {
                try {
                    await bot.deleteMessage(msg.chat.id, msg.message_id)
                    await bot.sendMessage(
                        msg.chat.id,
                        'Сообщение из запрещенного канала удалено.'
                    )
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
})
