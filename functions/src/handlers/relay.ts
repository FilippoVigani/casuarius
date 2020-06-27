import TelegramBot = require("node-telegram-bot-api")
import { ContextHandler } from "./context-handler"
import { ChatContext } from "./context"

type RelayChatContext = ChatContext & {
    context: 'relay',
    scope: 'message-received',
    messageId: number,
    chatId: number
}

export class RelayHandler implements ContextHandler<RelayChatContext> {
    readonly contextSlug = 'relay'

    readonly relayCommandRegEx = new RegExp(/^\/relay(?:\@[\w]*Bot)?(?:\s*)([0-9\-]+)(?:\s*)([0-9\-]+)(?:\s*)([0-9\-]+)$/)

    constructor(
        private readonly bot: TelegramBot,
        private readonly firestore: FirebaseFirestore.Firestore
    ) {
        bot.on("callback_query", async (query) => {
            const relayMatch = this.relayCommandRegEx.exec(query.data || '')
            if (relayMatch) {
                await this.relay(query.from, query.message, parseInt(relayMatch[1]), parseInt(relayMatch[2]), parseInt(relayMatch[3]))
            }
        })
    }

    async handleContext(context: RelayChatContext, message: TelegramBot.Message) {
        if (context.scope === 'message-received') {
            //Not needed unless user should be able to type the group handle by hand
        }
    }

    async handle(message: TelegramBot.Message) {
        if (message.chat.type === 'private' && message.from) {
            const domainsSnapshot = await this.firestore.collection('domains').where('membersIds', 'array-contains', message.from.id).get()

            const domains = domainsSnapshot.docs.map(doc => {
                return { handle: doc.id, ...doc.data() }
            })

            const domainsIds = domainsSnapshot.docs.map(doc => doc.id)

            if (domains.length > 0) {
                const groupsSnapshot = await this.firestore.collection('groups').where('domain', 'in', domainsIds).get()

                const groups = await Promise.all(
                    groupsSnapshot.docs.map(doc => {
                        const group = doc.data()
                        if (group.name) {
                            return group
                        } else {
                            return this.bot.getChat(group.chatId).then(chat => {
                                return { ...group, name: chat.title || doc.id }
                            })
                        }
                    })
                )

                if (groups.length > 0) {
                    await this.bot.sendMessage(
                        message.chat.id,
                        `Which group should receive this message? Choose one or type /cancel.`,
                        {
                            reply_markup: {
                                inline_keyboard: groups.map(group => {
                                    return [<TelegramBot.InlineKeyboardButton>{
                                        text: this.getGroupDescriptor(group, domains.length > 0),
                                        callback_data: `/relay ${message.message_id} ${message.chat.id} ${group.chatId}`
                                    }]
                                })
                            }
                        }
                    )
                }
            }
        }
    }

    async relay(from: TelegramBot.User, message: TelegramBot.Message | undefined, messageId: number, fromChat: number, toChat: number) {
        await this.bot.forwardMessage(toChat, fromChat, messageId)

        const groupsSnapshot = await this.firestore.collection('groups').where('chatId', '==', toChat).get()

        let group: any = null
        if (groupsSnapshot.docs.length > 0) {
            const groupDoc = groupsSnapshot.docs[0].data()
            group = groupDoc.name
                ? groupDoc
                : await this.bot.getChat(groupDoc.chatId).then(chat => {
                    return { ...groupDoc, name: chat.title || groupDoc.id }
                })
        }

        if (message) {
            await this.bot.editMessageText(
                `Message forwarded${group ? ` to ${group.name} (${group.domain})` : ``}.`,
                {
                    chat_id: from.id,
                    message_id: message.message_id
                }).catch(err => {})
            await this.bot.editMessageReplyMarkup(
                { inline_keyboard: [[]] },
                {
                    chat_id: from.id,
                    message_id: message.message_id
                }
            ).catch(err => {})
        }
    }

    private getGroupDescriptor(group: any, showDomain: boolean): string {
        return `${group.name}${showDomain ? ` (${group.domain})` : ``}`
    }
}