import TelegramBot = require("node-telegram-bot-api")
import { ContextHandler } from "./context-handler"
import { ChatContext } from "./context"
import { ContextManager } from "./context-manager"

export class CreateDomainHandler implements ContextHandler {
    readonly contextSlug = 'create-domain'

    readonly domainRegEx = new RegExp(/^[a-z0-9]*$/)
    readonly commandRegEx = new RegExp(/^\/create(?:\s*)(.*)?$/)

    constructor(
        private readonly bot: TelegramBot,
        private readonly firestore: FirebaseFirestore.Firestore,
        private readonly contextManager: ContextManager,
    ) {
        bot.onText(this.commandRegEx, async (msg: TelegramBot.Message, match: RegExpExecArray | null) => {
            const handle = match && match[1]

            this.handle(msg.from?.id, msg.chat.id, handle)
        })

        bot.on("callback_query", async (query) => {
            console.log(query)
            if (query.data === this.contextSlug) {
                await this.handle(query.from.id, query.message?.chat.id || query.from.id)
            }
        })
    }

    async handleContext(context: ChatContext, message: TelegramBot.Message) {
        if (context.scope === 'domain-handle-requested') {
            await this.handle(message.from?.id, message.chat.id, message.text)
        }
    }

    async handle(adminId: number | undefined, chatId: number, domainHandle: string | null = null) {
        if (domainHandle) {
            if (!this.domainRegEx.test(domainHandle)) {
                await this.bot.sendMessage(chatId, `Invalid domain handle. Please retry.`)
            } else {
                const domainRef = this.firestore.collection('domains').doc(domainHandle)
                if ((await domainRef.get()).exists) {
                    await this.bot.sendMessage(chatId, `Domain already exists. Please retry with a different handle.`)
                } else {
                    await domainRef.set({
                        admin: adminId || chatId
                    })
                    await this.contextManager.resetContext(chatId)
                    await this.bot.sendMessage(chatId, `Domain '${domainHandle}' successfully created!`)
                }
            }
        } else {
            await this.contextManager.setContext(chatId, {
                context: 'create-domain',
                scope: 'domain-handle-requested'
            })

            await this.bot.sendMessage(chatId, `I need an handle for your domain, a text with only lowercase letters or digits, for example "pluto42". Type /cancel if you changed your mind. What's it going to be?`)
        }

    }
}