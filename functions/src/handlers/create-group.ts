import TelegramBot = require("node-telegram-bot-api")
import { ContextHandler } from "./context-handler"
import { ChatContext } from "./context"
import { ContextManager } from "./context-manager"

type CreateGroupChatContext = ChatContext & {
    context: 'create-group'
    scope: 'group-handle-requested' | 'domain-handle-requested',
    domainHandle: string | null
}

export class CreateGroupHandler implements ContextHandler<CreateGroupChatContext> {
    readonly contextSlug = 'create-group'

    readonly groupHandleRegEx = new RegExp(/^[a-z0-9]+$/)
    readonly commandRegEx = new RegExp(/^\/group(?:\@[\w]*Bot)?$/)

    constructor(
        private readonly bot: TelegramBot,
        private readonly firestore: FirebaseFirestore.Firestore,
        private readonly contextManager: ContextManager<CreateGroupChatContext>,
    ) {
        bot.onText(this.commandRegEx, async (msg: TelegramBot.Message, match: RegExpExecArray | null) => {
            await this.handle(msg.from, msg.chat.id)
        })
    }

    async handleContext(context: CreateGroupChatContext, message: TelegramBot.Message) {
        switch (context.scope) {
            case 'domain-handle-requested': {
                const domainHandle = message.text || ''

                const domainDoc = await this.firestore.collection('domains').doc(domainHandle).get()

                const domain = domainDoc.data()

                if (domain && domain.admin.id === message.from?.id) {
                    await this.contextManager.setContext(message.chat.id, {
                        context: 'create-group',
                        scope: 'group-handle-requested',
                        domainHandle: domainDoc.id
                    })
                    await this.bot.sendMessage(message.chat.id, `Great! I am going to create a group in the domain '${domainDoc.id}', please type an handle for it.`, {
                        reply_markup: {
                            remove_keyboard: true
                        }
                    })
                } else {
                    await this.bot.sendMessage(message.chat.id, `Uhh either the domain '${domainDoc.id}' doesn't exist or you are not an admin. Please retry with a domain you are an admin of.`)
                }
                break; 
            }
            case 'group-handle-requested': {
                const groupHandle = message.text || ''
                if (!this.groupHandleRegEx.test(groupHandle)){
                    await this.bot.sendMessage(message.chat.id, `Invalid group handle. Please retry.`)
                } else {
                    const groupRef = this.firestore.collection('groups').doc(groupHandle)

                    await this.contextManager.resetContext(message.chat.id)

                    await groupRef.set({
                        domain: context.domainHandle,
                        chatId: message.chat.id,
                        name: message.chat.title || null
                    })

                    await this.bot.sendMessage(message.chat.id, `Super! Now members of the domain '${context.domainHandle}', will be able to send messages here with the handle '${groupHandle}'.`)
                }
                break; 
            }
        }
    }

    async handle(admin: TelegramBot.User | undefined, chatId: number) {
        if (!admin){
            await this.bot.sendMessage(chatId, `I can't create a group from a channel. Please text me in private.`)
        } else {
            const domainsRef = this.firestore.collection('domains').where('admin.id', '==', admin.id)
            const domainsSnapshot = await domainsRef.get()
    
            const domains = domainsSnapshot.docs.map(doc => {
                return { handle: doc.id, ...doc.data() }
            })
    
            if (domains.length === 0) {
                await this.bot.sendMessage(chatId, `You need to have created a domain first in order to create a group in it.`)
            } else if (domains.length === 1) {
                await this.contextManager.setContext(chatId, {
                    context: 'create-group',
                    scope: 'group-handle-requested',
                    domainHandle: domains[0].handle
                })
                await this.bot.sendMessage(chatId, `Great! I am creating a group in the domain '${domains[0].handle}', please type an handle for it.`)
            } else {
                await this.contextManager.setContext(chatId, <CreateGroupChatContext>{
                    context: 'create-group',
                    scope: 'domain-handle-requested',
                    domainHandle: null
                })
    
                await this.bot.sendMessage(chatId, `It looks like you are the admin of several domains. Please choose the one you wish to create this group in.`, {
                    reply_markup: {
                        one_time_keyboard: true,
                        keyboard: domains.map(domain => {
                            return [<TelegramBot.KeyboardButton>{ text: domain.handle }]
                        })
                    }
                })
            }
        }
    }
}