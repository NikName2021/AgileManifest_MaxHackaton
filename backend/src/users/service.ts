import { db } from "../db.js";

// upsertUser продолжает всегда обновлять chatId на "последний увиденный чат" — это осознанно:
// нужен какой-то "текущий" чат для диалогов создания вакансии и разговорных команд (/новая_вакансия,
// /отмена), которые всегда идут в чате, откуда пришло сообщение. Раньше это было ЕДИНСТВЕННЫМ
// источником адреса для уведомлений (новый отклик, смена статуса, напоминания) — и группа/канал,
// куда бот тоже добавлен, могла молча "украсть" будущие уведомления у работодателя.
// Реальный фикс — Vacancy.employerChatId и Application.candidateChatId (см. schema.prisma): они
// застывают один раз, в момент, когда чат точно известен и уместен, и используются как основной
// источник адреса при отправке уведомлений; user.chatId остаётся лишь фолбэком для старых записей
// и для самого диалога создания вакансии.
// isDialog=true — только для событий, где чат гарантированно личный (bot_started: по документации
// MAX deep link и «Начать» открывают приватный чат с ботом). Тогда же фиксируем dialogChatId —
// адрес для уведомлений кандидату и признак hasBotChat в GET /api/me.
export function upsertUser(maxUserId: string, chatId: string, displayName?: string, options: { isDialog?: boolean } = {}) {
    const dialog = options.isDialog ? { dialogChatId: chatId } : {};
    return db.user.upsert({
        where: { maxUserId },
        update: { chatId, ...dialog, ...(displayName ? { displayName } : {}) },
        create: { maxUserId, chatId, displayName, ...dialog },
    });
}

// Используется мини-аппом (см. server.ts POST /api/auth/max): в отличие от upsertUser, НИКОГДА
// не перезаписывает уже известный chatId — initData мини-аппа не содержит chat_id, и если
// пользователь уже писал боту напрямую (значит, chatId в БД настоящий), затирать его было бы регрессией.
export async function findOrCreateUserByMaxId(maxUserId: string, displayName?: string) {
    // upsert (ON CONFLICT), а не find+create: два одновременных первых входа одного пользователя
    // раньше давали P2002 и 409 на POST /api/auth/max.
    // Пустой chatId — плейсхолдер: пока пользователь не писал боту, слать сообщения некуда;
    // настоящий chatId проставит upsertUser при первом сообщении.
    return db.user.upsert({
        where: { maxUserId },
        update: displayName ? { displayName } : {},
        create: { maxUserId, chatId: '', displayName },
    });
}
