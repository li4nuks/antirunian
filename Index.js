app.post('/webhook', async (req, res) => {
    try {
        const body = req.body

        if (body.message) {
            const msg = body.message
            let shouldDelete = false

            // 1. Проверка обычного текста сообщения (переводим в нижний регистр)
            if (msg.text) {
                const text = msg.text.toLowerCase()
                if (text.includes('руниан')) {
                    shouldDelete = true
                }
            }

            // 2. Проверка скрытых кликабельных ссылок (Entities)
            if (msg.entities) {
                for (const entity of msg.entities) {
                    // Ищем ссылки, зашитые в текст
                    if (entity.type === 'text_link' && entity.url) {
                        if (entity.url.toLowerCase().includes('runianews')) {
                            shouldDelete = true
                            break
                        }
                    }
                }
            }

            // 3. Железобетонная проверка: Переслано ли сообщение из канала runianews напрямую
            // Telegram использует объект forward_origin для пересланных сообщений
            if (msg.forward_origin && msg.forward_origin.chat) {
                const sourceChat = msg.forward_origin.chat
                
                // Проверяем по юзернейму канала
                if (sourceChat.username && sourceChat.username.toLowerCase() === 'runianews') {
                    shouldDelete = true
                }
                
                // Альтернативно: можно заблокировать по ID канала, если он станет приватным
                // if (sourceChat.id === -100XXXXXXXXXX) { shouldDelete = true }
            }

            // Если сработало любое из условий — удаляем
            if (shouldDelete) {
                try {
                    await bot.deleteMessage(msg.chat.id, msg.message_id)
                    await bot.sendMessage(
                        msg.chat.id,
                        'Сообщение из запрещенного канала удалено.'
                    )
                } catch (e) {
                    console.error('Ошибка удаления сообщения:', e.message)
                }
            }
        }

        res.send('ok')

    } catch (err) {
        console.error('Ошибка сервера вебхука:', err)
        res.send('error')
    }
})