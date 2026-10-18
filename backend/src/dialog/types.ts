// Ключ в data сессии: MAX user_id того, кто начал диалог. Сессия хранится по chatId, и в
// групповом чате без этой метки чужие ответы продвигали бы диалог, а вакансия записывалась бы
// на того, чей «последний чат» совпал (findFirst по chatId).
export const OWNER_KEY = 'ownerMaxUserId';

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
    onComplete: (chatId: string, data: Record<string, any>) => Promise<string>;
}