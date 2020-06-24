import * as functions from 'firebase-functions'
import TelegramBot = require('node-telegram-bot-api')

const token: string = functions.config().bot.token

const bot = new TelegramBot(token)

bot.onText(new RegExp(/\/start/), (msg: TelegramBot.Message) => {
    const options: TelegramBot.SendMessageOptions = {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: "Create a new domain", callback_data: "create-domain" },
                    { text: "Join an existing domain", callback_data: "join-domain" }
                ]
            ]
        }
    }

    bot.sendMessage(
        msg.chat.id,
        `Welcome ${msg.from?.first_name}! To get started /create or /join a domain. Once you are in a domain you will be able to target groups to forward your messages to.`,
        options
    ).catch(err => console.log(err))
})

bot.on("message", (message, metadata) => {
    console.log(message)
    bot.sendMessage(message.chat.id, 'I am alive!')
    .catch(err => console.log(err))
})

exports.webhook = functions.region('europe-west3').https.onRequest((req, res) => {
    const url: string = functions.config().bot.url
    try {
        const success = bot.setWebHook(url)
        if (success)
            res.send(`Webhook set to ${url}`)
        else
            res.send(`Failed setting webhook to ${url}`)
    } catch (error) {
        console.log(error)
        res.status(500).send(`Failed setting webhook to ${url}`)
    }
})

exports.bot = functions.region('europe-west3').https.onRequest((req, res) => {
    try {
        console.log("REQUEST:")
        console.log(req.body)
        console.log("END_REQUEST")
        //bot.processUpdate(req.body)
        return res.sendStatus(200)
    } catch (error) {
        console.log(error)
        return res.status(500).send("Something went wrong")
    }
})