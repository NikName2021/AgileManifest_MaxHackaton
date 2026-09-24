import { db } from '../db.js';
import { maxApi, type InlineButton } from '../max/client.js';
import { vacancyFlow } from './vacancyFlow.js';
import type { DialogFlow } from './types.js';

const flows: Record<string, DialogFlow> = {
    [vacancyFlow.name]: vacancyFlow,
};

async function sendStepPrompt(chatId: string, flow: DialogFlow, stepIndex: number) {
    const step = flow.steps[stepIndex];
    const buttons: InlineButton[][] | undefined = step.buttons?.map((row) =>
        row.map((btn) => ({ type: 'callback' as const, text: btn.text, payload: btn.value }))
    );
    await maxApi.sendMessage(chatId, step.prompt, buttons);
}

export async function startFlow(chatId: string, flowName: string) {
    const flow = flows[flowName];
    if (!flow) throw new Error(`Unknown flow: ${flowName}`);

    await db.dialogSession.upsert({
        where: { chatId },
        update: { step: 0, data: {} },
        create: { chatId, step: 0, data: {} },
    });

    await sendStepPrompt(chatId, flow, 0);
}

export async function cancelFlow(chatId: string) {
  await db.dialogSession.deleteMany({ where: { chatId } });
  await maxApi.sendMessage(chatId, 'Ок, отменил текущий диалог.');
}

/**
 * Обрабатывает ответ пользователя (текст или значение с кнопки) на текущем шаге.
 * Возвращает true, если сообщение было адресовано активному диалогу (и, значит,
 * не нужно обрабатывать его как что-то ещё), иначе false — активной сессии нет.
 */
export async function handleAnswer(chatId: string, rawAnswer: string): Promise<boolean> {
    const session = await db.dialogSession.findUnique({ where: { chatId } });
    if (!session) return false;

    // Сессия могла остаться от старого запуска другого флоу — сейчас у нас он один
    const flow = vacancyFlow;
    const step = flow.steps[session.step];
    if (!step) {
        // на всякий случай — рассинхрон, чистим сессию
        await db.dialogSession.deleteMany({ where: { chatId } });
        return false;
    }

    const parsed = step.parse ? step.parse(rawAnswer) : { ok: true as const, value: rawAnswer };
    if (!parsed.ok) {
        await maxApi.sendMessage(chatId, parsed.error);
        return true;
    }

    const data = { ...(session.data as Record<string, any>), [step.key]: parsed.value };
    const nextStep = session.step + 1;

    if (nextStep < flow.steps.length) {
        await db.dialogSession.update({ where: { chatId }, data: { step: nextStep, data } });
        await sendStepPrompt(chatId, flow, nextStep);
    } else {
        await db.dialogSession.deleteMany({ where: { chatId } });
        const resultText = await flow.onComplete(chatId, data);
        await maxApi.sendMessage(chatId, resultText);
    }

    return true;
}