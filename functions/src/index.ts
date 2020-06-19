import * as functions from 'firebase-functions'
import Telegraf, { Context } from 'telegraf'

const bot: Telegraf<Context> = new Telegraf(functions.config().bot.token)

bot.telegram.setWebhook(functions.config().bot.url)
.catch(error => {
    console.log(error)
})

bot.command('/start', (ctx: Context) => ctx.reply('Hello').catch(error => {
    console.log(error)
}))
bot.hears('yo', (ctx: Context) => ctx.reply('Yo').catch(error => {
    console.log(error)
}))

exports.bot = functions.region('europe-west3').https.onRequest((req, res) => {
    bot.handleUpdate(req.body, res)
    .then( rv => !rv && res.sendStatus(200))
    .catch(error => {
        console.log(error)
    })
})