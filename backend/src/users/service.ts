import { db } from "../db.js";

// chatId — «последний увиденный чат» (может быть группой); уведомления идут не в него, а в
// застывшие Vacancy.employerChatId / Application.candidateChatId или в dialogChatId.
// isDialog — только для событий, где чат гарантированно личный (bot_started).
export function upsertUser(maxUserId: string, chatId: string, displayName?: string, options: { isDialog?: boolean } = {}) {
    const dialog = options.isDialog ? { dialogChatId: chatId } : {};
    return db.user.upsert({
        where: { maxUserId },
        update: { chatId, ...dialog, ...(displayName ? { displayName } : {}) },
        create: { maxUserId, chatId, displayName, ...dialog },
    });
}

// Вход через мини-приложение: initData не содержит chat_id, поэтому известный chatId не трогаем.
export async function findOrCreateUserByMaxId(maxUserId: string, displayName?: string) {
    // upsert, а не find+create: одновременный первый вход не упадёт на уникальном индексе.
    // Пустой chatId — пользователь ещё не писал боту, его проставит upsertUser.
    return db.user.upsert({
        where: { maxUserId },
        update: displayName ? { displayName } : {},
        create: { maxUserId, chatId: '', displayName },
    });
}
