import TelegramBot = require("node-telegram-bot-api")
import { ContextHandler } from "./context-handler"
import { ChatContext } from "./context"
import { ContextManager } from "./context-manager"

type CreateDomainChatContext = ChatContext & {
    context: 'create-domain',
    scope: 'domain-handle-requested'
}

export class CreateDomainHandler implements ContextHandler<CreateDomainChatContext> {
    readonly contextSlug = 'create-domain'

    readonly domainRegEx = new RegExp(/^[a-z0-9]+$/)
    readonly commandRegEx = new RegExp(/^\/create(?:\@[\w]*Bot)?(?:\s*)(.*)?$/)

    constructor(
        private readonly bot: TelegramBot,
        private readonly firestore: FirebaseFirestore.Firestore,
        private readonly contextManager: ContextManager<CreateDomainChatContext>,
    ) {
        bot.onText(this.commandRegEx, async (msg: TelegramBot.Message, match: RegExpExecArray | null) => {
            const handle = match && match[1]

            await this.handle(msg.from, msg.chat.id, handle)
        })

        bot.on("callback_query", async (query) => {
            if (query.data === `/create`) {
                await this.handle(query.from, query.message?.chat.id || query.from.id)
            }
        })
    }

    async handleContext(context: CreateDomainChatContext, message: TelegramBot.Message) {
        if (context.scope === 'domain-handle-requested') {
            await this.handle(message.from, message.chat.id, message.text)
        }
    }

    async handle(admin: TelegramBot.User | undefined, chatId: number, domainHandle: string | null = null) {
        if (!admin){
            await this.bot.sendMessage(chatId, `I can't create a domain from a channel. Please text me in private.`)
        } else {
            if (domainHandle) {
                if (!this.domainRegEx.test(domainHandle)) {
                    await this.bot.sendMessage(chatId, `Invalid domain handle. Please retry.`)
                } else {
                    const domainRef = this.firestore.collection('domains').doc(domainHandle)
                    if ((await domainRef.get()).exists) {
                        await this.bot.sendMessage(chatId, `Domain already exists. Please retry with a different handle.`)
                    } else {
                        await this.contextManager.resetContext(chatId)
                        await domainRef.set({
                            admin: admin
                        })
                        await this.bot.sendMessage(chatId, `Domain '${domainHandle}' successfully created!`)
                    }
                }
            } else {
                await this.contextManager.setContext(chatId, {
                    context: this.contextSlug,
                    scope: 'domain-handle-requested'
                })
    
                await this.bot.sendMessage(chatId, `I need an handle for your domain, a text with only lowercase letters or digits, for example "pluto42". Type /cancel if you changed your mind. What's it going to be?`)
            }
        }
    }
}