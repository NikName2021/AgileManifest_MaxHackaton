// MAX user_id начавшего диалог (в data сессии). Сессия хранится по chatId — в группе без этой
// метки чужие ответы продвигали бы диалог, а вакансия записывалась бы не на того пользователя.
export const OWNER_KEY = 'ownerMaxUserId';

import type { InlineButton } from '../max/client.js';

export interface BotReply {
    text: string;
    buttons?: InlineButton[][];
}

export interface ButtonOptions {
    text: string;
    value: string;
}

export interface StepDef {
    key: string;
    prompt: string;
    buttons?: ButtonOptions[][];
    parse?: (raw: string) => { ok: true; value: unknown } | { ok: false; error: string };
}

export interface DialogFlow {
    name: string;
    steps: StepDef[];
    onComplete: (chatId: string, data: Record<string, any>) => Promise<string | BotReply[]>;
}