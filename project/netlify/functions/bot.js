const TelegramBot = require('node-telegram-bot-api')

// токен лучше хранить в env
const bot = new TelegramBot(process.env.BOT_TOKEN)

const badWords = ['РУНИАН']

exports.handler = async (event) => {
    const body = JSON.parse(event.body)

    if (body.message && body.message.text) {
        const msg = body.message
        const text = msg.text.toLowerCase()

        const hasBadWord = badWords.some(w => text.includes(w))

        if (hasBadWord) {
            try {
                // удалить сообщение
                await bot.deleteMessage(msg.chat.id, msg.message_id)

                // уведомление
                await bot.sendMessage(
                    msg.chat.id,
                    `Обнаружен руниан контент, нейтрализую`
                )
            } catch (e) {
                console.log(e)
            }
        }
    }

    return {
        statusCode: 200,
        body: 'ok'
    }
}