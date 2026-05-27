const express = require('express')
const TelegramBot = require('node-telegram-bot-api')

const app = express()
app.use(express.json())

const TOKEN = process.env.BOT_TOKEN

const bot = new TelegramBot(TOKEN)

// твои запрещённые слова
const badWords = ['руниан']

app.post('/webhook', async (req, res) => {
    try {
        const body = req.body

        if (body.message && body.message.text) {
            const msg = body.message
            const text = msg.text.toLowerCase()

            const hasBadWord = badWords.some(w => text.includes(w))

            if (hasBadWord) {
                try {
                    await bot.deleteMessage(msg.chat.id, msg.message_id)

                    await bot.sendMessage(
                        msg.chat.id,
                        'Обнаружен руниан контент, нейтрализую'
                    )
                } catch (e) {
                    console.log(e)
                }
            }
        }

        res.send('ok')

    } catch (err) {
        console.log(err)
        res.send('error')
    }
})

// Render требует слушать порт
const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
    console.log('Bot server running on port', PORT)
})