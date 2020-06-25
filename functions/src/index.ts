import * as functions from 'firebase-functions'
import TelegramBot = require('node-telegram-bot-api')
import admin = require('firebase-admin')
import { ChatContext } from './handlers/context'
import { CreateDomainHandler } from './handlers/create-domain'
import { ContextManager } from './handlers/context-manager'

//Initialize database manually since automatic Google Credentials retrieval doesn't work. See https://stackoverflow.com/questions/58127896/error-could-not-load-the-default-credentials-firebase-function-to-firestore
const serviceAccount = require("../serviceAccountKey.json")
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
})

const firestore = admin.firestore()

const token: string = functions.config().bot.token

const bot = new TelegramBot(token)

const contextManager = new ContextManager(firestore)

const handlers = [
    new CreateDomainHandler(bot, firestore, contextManager)
]

bot.onText(new RegExp(/\/start/), async (message: TelegramBot.Message) => {
    await bot.sendMessage(
        message.chat.id,
        `Welcome ${message.from?.first_name}! To get started /create or /join a domain. Once you are in a domain you will be able to target groups to forward your messages to.`,
        {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "Create a new domain", callback_data: "create-domain" },
                        { text: "Join an existing domain", callback_data: "join-domain" }
                    ]
                ]
            }
        }
    )
})

bot.onText(new RegExp(/\/cancel/), async (message: TelegramBot.Message) => {
    await contextManager.resetContext(message.chat.id)

    await bot.sendMessage(message.chat.id, `I'm right here if you need anything.`)
})

//Only match messages that are not commands
bot.onText(new RegExp(/^[^\/].*/), async (message: TelegramBot.Message, metadata) => {
    const context = await contextManager.getContext(message.chat.id)
    if (context) {
        await handleContextMessage(context, message)
    } else {
        await bot.sendMessage(message.chat.id, 'Not sure what you mean')
    }
})

async function handleContextMessage(context: ChatContext, message: TelegramBot.Message) {
    console.log(context)
    const handler = handlers.find(handler => handler.contextSlug === context.context)

    if (handler) {
        await handler.handleContext(context, message)
    } else {
        await bot.sendMessage(message.chat.id, 'Not sure what you mean')
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