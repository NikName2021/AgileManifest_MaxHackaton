import type { FastifyReply } from 'fastify';

// Единый конверт ошибки API: { error: { code, message, fields? } }. Frontend опирается на code.
export type ErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'validation_error'
  | 'conflict'
  | 'upstream_error'
  | 'service_unavailable'
  | 'internal_error'
  // Работодатель ещё не писал боту — публиковать карточку некуда.
  | 'employer_chat_missing'
  // Таймаут MAX при публикации: вакансия остаётся published, повторный publish не создаст дубль.
  | 'card_delivery_unknown'
  | 'self_application_forbidden'
  // Вакансия — черновик или закрыта.
  | 'vacancy_unavailable'
  // Повторный отклик, в том числе через бота.
  | 'already_applied';

export interface ErrorFields {
  [field: string]: string[];
}

export function sendError(
  reply: FastifyReply,
  status: number,
  code: ErrorCode,
  message: string,
  fields?: ErrorFields
): FastifyReply {
  return reply.code(status).send({
    error: {
      code,
      message,
      ...(fields ? { fields } : {}),
    },
  });
}

// zod кладёт в fieldErrors ключ для каждого поля схемы, даже без ошибок — отбрасываем пустые.
export function zodFieldErrors(flat: { fieldErrors: Record<string, string[] | undefined> }): ErrorFields {
  const fields: ErrorFields = {};
  for (const [key, messages] of Object.entries(flat.fieldErrors)) {
    if (messages && messages.length > 0) fields[key] = messages;
  }
  return fields;
}
