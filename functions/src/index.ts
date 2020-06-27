import * as functions from 'firebase-functions'
import TelegramBot = require('node-telegram-bot-api')
import admin = require('firebase-admin')
import { ChatContext } from './handlers/context'
import { CreateDomainHandler } from './handlers/create-domain'
import { ContextManager } from './handlers/context-manager'
import { CreateGroupHandler } from './handlers/create-group'
import { JoinDomainHandler } from './handlers/join-domain'
import { RelayHandler } from './handlers/relay'

//Initialize database manually since automatic Google Credentials retrieval doesn't work. See https://stackoverflow.com/questions/58127896/error-could-not-load-the-default-credentials-firebase-function-to-firestore
const serviceAccount = require("../serviceAccountKey.json")
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
})

const firestore = admin.firestore()

const token: string = functions.config().bot.token

const bot = new TelegramBot(token)

const contextManager = new ContextManager<ChatContext | any>(firestore)

const relayHandler = new RelayHandler(bot, firestore)

const handlers = [
    new CreateDomainHandler(bot, firestore, contextManager),
    new CreateGroupHandler(bot, firestore, contextManager),
    new JoinDomainHandler(bot, firestore, contextManager)
]

bot.onText(new RegExp(/\/start(?:\@[\w]*Bot)?/), async (message: TelegramBot.Message) => {
    await bot.sendMessage(
        message.chat.id,
        `Welcome ${message.from?.first_name}!
To get started /create or /join a domain. Once you are in a domain you will be able to target groups to forward your messages to.
If you are having troubles, type /help.`,
        {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: `Create a new domain`, callback_data: `/create` },
                        { text: `Join an existing domain`, callback_data: `/join` }
                    ]
                ]
            }
        }
    )
})

bot.onText(new RegExp(/\/help(?:\@[\w]*Bot)?/), async (message: TelegramBot.Message) => {
    await contextManager.resetContext(message.chat.id)

    await bot.sendMessage(
        message.chat.id,
        `I can help you to forward messages to groups that you are not a part of.
In order to do that, you need to be part of a domain, which contains several groups. When you are part of a domain and send a private message to me, I will forward it to the group of your choice.

To control me, you can send me the following commands:

/create Creates a new domain and makes you the admin of it.
/join Joins an existing domain, so that I can relay messages to groups for you
/group When inside a group, creates a new group messages can be forwarded to
/cancel Cancels the current operation`
    )
})

bot.onText(new RegExp(/\/cancel(?:\@[\w]*Bot)?/), async (message: TelegramBot.Message) => {
    await contextManager.resetContext(message.chat.id)

    await bot.sendMessage(message.chat.id, `I'm right here if you need anything.`)
})

const nonCommandRegex = new RegExp(/^[^\/].*/)
//Only match messages that are not commands
bot.on('message', async (message: TelegramBot.Message, metadata) => {
    if (!message.text || nonCommandRegex.test(message.text)) {
        const context = await contextManager.getContext(message.chat.id)
        if (context) {
            await handleContextMessage(context, message)
        } else {
            await relayHandler.handle(message)
        }
    }
})

async function handleContextMessage(context: any, message: TelegramBot.Message) {
    const matchingHandler = handlers.find(handler => handler.contextSlug === context.context)

    if (matchingHandler) {
        await matchingHandler.handleContext(context, message)
    } else {
        await bot.sendMessage(message.chat.id, 'Not sure what you mean.')
    }
}

exports.webhook = functions.region('europe-west3').https.onRequest((req, res) => {
    if (req.query.token !== functions.config().bot.token) {
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
        bot.processUpdate(req.body)
        return res.sendStatus(200)
    } catch (error) {
        console.log(error)
        return res.status(500).send("Something went wrong")
    }
})