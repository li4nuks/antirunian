app.post('/webhook', async (req, res) => {
    try {
        const body = req.body

        if (body.message) {
            const msg = body.message
            let shouldDelete = false

            // 1. Собираем текст отовсюду (обычный текст ИЛИ подпись к картинке/видео)
            const fullText = (msg.text || msg.caption || '').toLowerCase()

            if (fullText.includes('руниан')) {
                shouldDelete = true
            }

            // 2. Собираем сущности (ссылки) отовсюду (из текста ИЛИ из подписи к медиа)
            const allEntities = msg.entities || msg.caption_entities || []
            
            for (const entity of allEntities) {
                if (entity.type === 'text_link' && entity.url) {
                    if (entity.url.toLowerCase().includes('runianews')) {
                        shouldDelete = true
                        break
                    }
                }
            }

            // 3. Проверка метаданных пересылки (работает, даже если текст вообще изменят)
            // В Telegram API пересылка из каналов часто пакуется в forward_from_chat
            if (msg.forward_from_chat) {
                const chat = msg.forward_from_chat
                if (chat.username && chat.username.toLowerCase() === 'runianews') {
                    shouldDelete = true
                }
            }
            // Дополнительная проверка для новых версий Telegram API (forward_origin)
            if (msg.forward_origin && msg.forward_origin.chat) {
                const chat = msg.forward_origin.chat
                if (chat.username && chat.username.toLowerCase() === 'runianews') {
                    shouldDelete = true
                }
            }

            // Если сработало хоть одно условие — удаляем
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
