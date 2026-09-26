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
export function upsertUser(maxUserId: string, chatId: string, displayName?: string) {
    return db.user.upsert({
        where: { maxUserId },
        update: { chatId, ...(displayName ? { displayName } : {}) },
        create: { maxUserId, chatId, displayName },
    });
}

// Используется мини-аппом (см. server.ts POST /api/auth/max): в отличие от upsertUser, НИКОГДА
// не перезаписывает уже известный chatId — initData мини-аппа не содержит chat_id, и если
// пользователь уже писал боту напрямую (значит, chatId в БД настоящий), затирать его было бы регрессией.
export async function findOrCreateUserByMaxId(maxUserId: string, displayName?: string) {
    const existing = await db.user.findUnique({ where: { maxUserId } });
    if (existing) {
        if (displayName && displayName !== existing.displayName) {
            return db.user.update({ where: { id: existing.id }, data: { displayName } });
        }
        return existing;
    }
    // Пустая строка — намеренный плейсхолдер, а не баг: пока пользователь мини-аппа ни разу не
    // писал боту в обычном чате, реального chat_id для него нет и слать sendMessage некуда.
    // Как только он откроет обычный чат с ботом, upsertUser (см. выше) проставит настоящий chatId.
    return db.user.create({ data: { maxUserId, chatId: '', displayName } });
}
