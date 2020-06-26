import { ChatContext } from "./context"

export class ContextManager<T extends ChatContext> {
    constructor(private firestore: FirebaseFirestore.Firestore) { }

    async setContext(chatId: number, context: T) {
        const contextRef = this.firestore.collection('contexts').doc(chatId.toString())
        await contextRef.set(context)
    }

    async resetContext(chatId: number) {
        const contextRef = this.firestore.collection('contexts').doc(chatId.toString())
        await contextRef.delete()
    }

    async getContext(chatId: number): Promise<T | undefined> {
        const contextRef = this.firestore.collection('contexts').doc(chatId.toString())
        const contextDoc = await contextRef.get()
        return contextDoc.data() as T | undefined
    }
}