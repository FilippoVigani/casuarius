import * as functions from 'firebase-functions'
import TelegramBot = require('node-telegram-bot-api')
import admin = require('firebase-admin')
admin.initializeApp()

const db = admin.firestore()

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
        `HEYOO Welcome ${msg.from?.first_name}! To get started /create or /join a domain. Once you are in a domain you will be able to target groups to forward your messages to.`,
        options
    ).catch(err => console.log(err))
})

bot.onText(new RegExp(/\/create/), async (msg: TelegramBot.Message) => {
    const contextRef = db.collection('contexts').doc(msg.chat.id.toString())

    await contextRef.set({
        context: 'create-domain',
        scope: 'domain-handle-requested',
        timestamp: admin.firestore.Timestamp.now()
    })
    
    await bot.sendMessage(msg.chat.id, `Specify an handle for your domain. It must be a text with only lowercase characters or digits.`)

})

function handleContextMessage(context: any, msg: TelegramBot.Message){

}

bot.on("message", async (msg: TelegramBot.Message, metadata) => {

    const contextRef = db.collection('contexts').doc(msg.chat.id.toString())

    const contextDoc = await contextRef.get()

    if (contextDoc.exists){
        console.log(contextDoc)
        handleContextMessage(contextDoc.data(), msg)
    }

    console.log(msg)
    bot.sendMessage(msg.chat.id, 'I am alive!')
        .catch(err => console.log(err))
})

exports.webhook = functions.region('europe-west3').https.onRequest((req, res) => {
    if (req.query.token != functions.config().bot.token) {
        res.status(401).send("Invalid telegram bot token")
    } else {
        const url: string = req.query.url || functions.config().bot.url
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
    }
})

exports.bot = functions.region('europe-west3').https.onRequest((req, res) => {
    try {
        console.log("REQUEST:")
        console.log(req.body)
        console.log("END_REQUEST")
        bot.processUpdate(req.body)
        return res.sendStatus(200)
    } catch (error) {
        console.log(error)
        return res.status(500).send("Something went wrong")
    }
})