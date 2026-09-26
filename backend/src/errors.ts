import type { FastifyReply } from 'fastify';

// Единый формат ошибки для всего REST API (раздел 3.5 хендоффа фронтендера — нужен стабильный
// контракт, который frontend может парсить одинаково для любого эндпоинта, а не строку как попало).
export type ErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'validation_error'
  | 'conflict'
  | 'upstream_error'
  | 'service_unavailable'
  | 'internal_error';

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

// Превращает результат zod safeParse (ok: false) в fields в духе { fieldName: ["сообщение", ...] }.
export function zodFieldErrors(flat: { fieldErrors: Record<string, string[] | undefined> }): ErrorFields {
  const fields: ErrorFields = {};
  for (const [key, messages] of Object.entries(flat.fieldErrors)) {
    if (messages && messages.length > 0) fields[key] = messages;
  }
  return fields;
}
