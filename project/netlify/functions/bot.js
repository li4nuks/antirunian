const TelegramBot = require('node-telegram-bot-api')

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: false })

const badWords = ['руниан']

exports.handler = async (event) => {
    try {
        const body = JSON.parse(event.body)

        if (body.message && body.message.text) {
            const msg = body.message
            const text = msg.text.toLowerCase()

            const hasBadWord = badWords.some(w => text.includes(w))

            if (hasBadWord) {
                await bot.deleteMessage(msg.chat.id, msg.message_id)

                await bot.sendMessage(
                    msg.chat.id,
                    'Обнаружен руниан контент, нейтрализую'
                )
            }
        }

        return {
            statusCode: 200,
            body: 'ok'
        }

    } catch (err) {
        console.log(err)

        return {
            statusCode: 200,
            body: 'error handled'
        }
    }
}