import { ChatContext } from "./context";
import TelegramBot = require("node-telegram-bot-api");

export interface ContextHandler{
    handleContext(context: ChatContext, sourceMessage: TelegramBot.Message): void
    readonly contextSlug: string
}