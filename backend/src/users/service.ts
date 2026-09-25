import { db } from "../db.js";

export function upsertUser(maxUserId: string, chatId: string, displayName?: string) {
    return db.user.upsert({
        where: { maxUserId },
        update: { chatId, ...(displayName ? { displayName } : {}) },
        create: { maxUserId, chatId, displayName },
    });
}