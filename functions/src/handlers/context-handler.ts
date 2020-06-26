import { ChatContext } from "./context";
import TelegramBot = require("node-telegram-bot-api");

export interface ContextHandler<T extends ChatContext>{
    handleContext(context: T, sourceMessage: TelegramBot.Message): void
    readonly contextSlug: string
}