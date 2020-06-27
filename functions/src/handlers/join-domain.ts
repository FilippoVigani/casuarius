import TelegramBot = require("node-telegram-bot-api")
import { ContextHandler } from "./context-handler"
import { ChatContext } from "./context"
import { ContextManager } from "./context-manager"

type JoinDomainChatContext = ChatContext & {
    context: 'join-domain',
    scope: 'domain-handle-requested'
}

export class JoinDomainHandler implements ContextHandler<JoinDomainChatContext> {
    readonly contextSlug = 'join-domain'

    readonly domainRegEx = new RegExp(/^[a-z0-9]+$/)
    readonly joinCommandRegEx = new RegExp(/^\/join(?:\@[\w]*Bot)?(?:\s*)([a-z0-9]+)?$/)
    readonly approveCommandRegEx = new RegExp(/^\/approve(?:\@[\w]*Bot)?(?:\s*)([0-9\-]+)(?:\s*)([a-z0-9]+)$/)
    readonly denyCommandRegEx = new RegExp(/^^\/deny(?:\@[\w]*Bot)?(?:\s*)([0-9\-]+)(?:\s*)([a-z0-9]+)$/)

    constructor(
        private readonly bot: TelegramBot,
        private readonly firestore: FirebaseFirestore.Firestore,
        private readonly contextManager: ContextManager<JoinDomainChatContext>,
    ) {
        bot.onText(this.joinCommandRegEx, async (msg: TelegramBot.Message, match: RegExpExecArray | null) => {
            const handle = match && match[1]

            await this.handle(msg.from, msg.chat.id, handle)
        })

        bot.on("callback_query", async (query) => {
            const data = query.data || ''

            const approveMatch = this.approveCommandRegEx.exec(data)
            const denyMatch = this.denyCommandRegEx.exec(data)

            if (approveMatch) {
                await this.approve(query.from, query.message, parseInt(approveMatch[1]), approveMatch[2])
            } else if (denyMatch) {
                await this.deny(query.from, query.message, parseInt(denyMatch[1]), denyMatch[2])
            }
        })
    }

    async handleContext(context: JoinDomainChatContext, message: TelegramBot.Message) {
        if (context.scope === 'domain-handle-requested') {
            await this.handle(message.from, message.chat.id, message.text)
        }
    }

    async handle(user: TelegramBot.User | undefined, chatId: number, domainHandle: string | null = null) {
        if (!user) {
            await this.bot.sendMessage(chatId, `You can't join a domain from a channel. Please text me in private.`)
        } else {
            if (domainHandle) {
                if (!this.domainRegEx.test(domainHandle)) {
                    await this.bot.sendMessage(chatId, `Invalid domain handle. Please retry.`)
                } else {
                    const domainRef = this.firestore.collection('domains').doc(domainHandle)

                    const domain = (await domainRef.get()).data()

                    if (domain) {
                        const userInMembers = (domain.membersIds || []).find((id: number) => user.id === id)
                        if (userInMembers) {
                            await this.bot.sendMessage(chatId, `You are already part of the domain ${domainHandle}.`)
                        } else {
                            const newDomainWaitlist = {
                                waitlist: [...(new Set(domain.waitlist).add(user))]
                            }
                            await domainRef.set(newDomainWaitlist, { merge: true })

                            await this.contextManager.resetContext(chatId)

                            await Promise.all([
                                this.bot.sendMessage(domain.admin.id, `${this.getUserDescriptor(user)} would like to join the domain '${domainHandle}'.`,
                                    {
                                        reply_markup: {
                                            inline_keyboard: [
                                                [
                                                    { text: "Approve", callback_data: `/approve ${user.id} ${domainHandle}` },
                                                    { text: "Deny", callback_data: `/deny ${user.id} ${domainHandle}` }
                                                ]
                                            ]
                                        }
                                    }
                                ),
                                this.bot.sendMessage(chatId, `A request to join this domain has been sent to the admin.`)
                            ])
                        }
                    } else {
                        await this.bot.sendMessage(chatId, `Domain not found. Please retry with a different handle.`)
                    }
                }
            } else {
                await this.contextManager.setContext(chatId, {
                    context: this.contextSlug,
                    scope: 'domain-handle-requested'
                })

                await this.bot.sendMessage(chatId, `What's the handle of the domain you would like to join?`)
            }
        }

    }

    private async approve(admin: TelegramBot.User, message: TelegramBot.Message | undefined, userId: number, domainHandle: string) {
        const domainRef = this.firestore.collection('domains').doc(domainHandle)
        const domain = (await domainRef.get()).data()

        if (domain && domain.admin.id === admin.id) {
            const userInMembers = (domain.members || []).find((user: TelegramBot.User) => user.id === userId)

            if (userInMembers) {
                await this.bot.sendMessage(admin.id, `${this.getUserDescriptor(userInMembers)} has already been approved in the domain '${domainHandle}'.`)
            } else {
                const userInWaitlist = (domain.waitlist || []).find((user: TelegramBot.User) => user.id === userId)

                if (!userInWaitlist) {
                    await this.bot.sendMessage(admin.id, `The request for this user is not longer valid. Please ask them to join again.`)
                } else {
                    await domainRef.set({
                        waitlist: (domain.waitlist || []).filter((user: TelegramBot.User) => user.id !== userId),
                        members: [...(new Set(domain.members).add(userInWaitlist))],
                        membersIds: [...(new Set(domain.membersIds).add(userInWaitlist.id))]
                    }, { merge: true })
                    await this.bot.sendMessage(admin.id, `${this.getUserDescriptor(userInWaitlist)} is now a part of the domain '${domainHandle}'.`)
                }
            }
            if (message) {
                await this.bot.editMessageReplyMarkup({
                    inline_keyboard: [
                        [
                            { text: "Kick", callback_data: `/deny ${userId} ${domainHandle}` }
                        ]
                    ]
                },
                    {
                        chat_id: admin.id,
                        message_id: message.message_id
                    }
                ).catch(err => {})
            }
        } else {
            await this.bot.sendMessage(admin.id, `Either the domain '${domainHandle}' doesn't exist or you are not an admin. You can only approve requests for a domain you are an admin of.`)
        }
    }

    private async deny(admin: TelegramBot.User, message: TelegramBot.Message | undefined, userId: number, domainHandle: string) {
        const domainRef = this.firestore.collection('domains').doc(domainHandle)
        const domain = (await domainRef.get()).data()

        if (domain && domain.admin.id === admin.id) {

            const userInMembers = (domain.members || []).find((u: TelegramBot.User) => u.id === userId)
            const userInWaitlist = (domain.waitlist || []).find((u: TelegramBot.User) => u.id === userId)

            const user = userInMembers || userInWaitlist

            if (!user) {
                await this.bot.sendMessage(admin.id, `The request for this user is not longer valid.`)
            } else {
                await domainRef.set({
                    waitlist: (domain.waitlist || []).filter((u: TelegramBot.User) => u.id !== userId),
                    members: (domain.members || []).filter((u: TelegramBot.User) => u.id !== userId),
                    membersIds: (domain.membersIds || []).filter((id: number) => id !== userId)
                }, { merge: true })
                if (userInMembers) {
                    await this.bot.sendMessage(admin.id, `${this.getUserDescriptor(user)} has been kicked from the domain '${domainHandle}'.`)
                } else if (userInWaitlist) {
                    await this.bot.sendMessage(admin.id, `${this.getUserDescriptor(user)} has been denied from joining the domain '${domainHandle}'.`)
                }
            }
            if (message) {
                await this.bot.editMessageReplyMarkup(
                    { inline_keyboard: [[]] },
                    {
                        chat_id: admin.id,
                        message_id: message.message_id
                    }
                ).catch(err => {})
            }
        } else {
            await this.bot.sendMessage(admin.id, `Either the domain '${domainHandle}' doesn't exist or you are not an admin. You can only approve requests for a domain you are an admin of.`)
        }
    }

    private getUserDescriptor(user: TelegramBot.User): string {
        return `${user.first_name}${user.last_name ? ` ${user.last_name}` : ``}${user.username ? ` (@${user.username})` : ``}`
    }
}