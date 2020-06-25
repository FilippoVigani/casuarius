import * as functions from 'firebase-functions'
import TelegramBot = require('node-telegram-bot-api')
import admin = require('firebase-admin')

//Initialize database manually since automatic Google Credentials retrieval doesn't work. See https://stackoverflow.com/questions/58127896/error-could-not-load-the-default-credentials-firebase-function-to-firestore
var serviceAccount = require("../serviceAccountKey.json")
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
})

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
        `Welcome ${msg.from?.first_name}! To get started /create or /join a domain. Once you are in a domain you will be able to target groups to forward your messages to.`,
        options
    ).catch(err => console.log(err))
})

bot.onText(new RegExp(/^\/create(?:\s*)(.*)?$/), async (msg: TelegramBot.Message, match: RegExpExecArray | null) => {
    const contextRef = db.collection('contexts').doc(msg.chat.id.toString())

    const handle = match && match[1]

    if (handle) {
        await createDomain(handle, msg)
    } else {
        await contextRef.set({
            context: 'create-domain',
            scope: 'domain-handle-requested'
        })

        await bot.sendMessage(msg.chat.id, `I need an handle for your domain, a text with only lowercase letters or digits, for example "pluto42". Type /cancel if you changed your mind. What's it going to be?`)
    }
})


bot.onText(new RegExp(/\/cancel/), async (msg: TelegramBot.Message) => {
    resetContext(msg.chat.id)

    await bot.sendMessage(msg.chat.id, `I'm right here if you need anything.`)
})

const domainRegEx = new RegExp(/^[a-z0-9]*$/)

async function createDomain(handle: string | undefined, srcMsg: TelegramBot.Message) {
    if (!handle || !domainRegEx.test(handle)) {
        await bot.sendMessage(srcMsg.chat.id, `Invalid domain handle. Please retry.`)
    } else {
        const domainRef = db.collection('domains').doc(handle)
        if ((await domainRef.get()).exists) {
            await bot.sendMessage(srcMsg.chat.id, `Domain already exists. Please retry with a different handle.`)
        } else {
            await domainRef.set({
                admin: srcMsg.from?.id || srcMsg.chat.id
            })
            await resetContext(srcMsg.chat.id)
            await bot.sendMessage(srcMsg.chat.id, `Domain '${handle}' successfully created!`)
        }
    }
}

async function handleContextMessage(context: any, msg: TelegramBot.Message) {
    if (context.context == 'create-domain') {
        if (context.scope == 'domain-handle-requested') {
            createDomain(msg.text, msg)
        }
    }
    console.log(context)
}

async function resetContext(chatId: number){
    const contextRef = db.collection('contexts').doc(chatId.toString())

    await contextRef.delete()
}

//Only match messages that are not commands
bot.onText(new RegExp(/^[^\/].*/), async (msg: TelegramBot.Message, metadata) => {
    const contextRef = db.collection('contexts').doc(msg.chat.id.toString())

    const contextDoc = await contextRef.get()

    if (contextDoc.exists) {
        await handleContextMessage(contextDoc.data(), msg)
    } else {
        await bot.sendMessage(msg.chat.id, 'Not sure what you mean')
    }
})

exports.webhook = functions.region('europe-west3').https.onRequest((req, res) => {
    if (req.query.token != functions.config().bot.token) {
        res.status(401).send("Invalid telegram bot token")
    } else {
        const url: string = req.query.url || functions.config().bot.url
        bot.setWebHook(url)
            .then(success => {
                if (success)
                    res.send(`Webhook set to ${url}`)
                else
                    res.send(`Failed setting webhook to ${url}`)
            })
            .catch(error => {
                console.log(error)
                res.status(500).send(`Failed setting webhook to ${url}`)
            })

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