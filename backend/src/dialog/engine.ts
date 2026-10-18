import { db } from '../db.js';
import { maxApi, type InlineButton } from '../max/client.js';
import { vacancyFlow } from './vacancyFlow.js';
import { OWNER_KEY, type DialogFlow } from './types.js';

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

export async function startFlow(chatId: string, flowName: string, ownerMaxUserId: string) {
    const flow = flows[flowName];
    if (!flow) throw new Error(`Unknown flow: ${flowName}`);

    const data = { [OWNER_KEY]: ownerMaxUserId };
    await db.dialogSession.upsert({
        where: { chatId },
        update: { step: 0, data },
        create: { chatId, step: 0, data },
    });

    await sendStepPrompt(chatId, flow, 0);
}

export async function cancelFlow(chatId: string) {
  // Сбрасываем и ожидание контакта после «Откликнуться», иначе следующее сообщение примется за контакт.
  const [deletedSession, deletedPending] = await Promise.all([
    db.dialogSession.deleteMany({ where: { chatId } }),
    db.pendingApplication.deleteMany({ where: { chatId } }),
  ]);
  const text = (deletedSession.count > 0 || deletedPending.count > 0)
    ? 'Ок, отменил текущий диалог.'
    : 'Сейчас нет активного диалога — нечего отменять. Напишите /новая_вакансия, чтобы начать.';
  await maxApi.sendMessage(chatId, text);
}

// true — сообщение адресовано активному диалогу; false — диалога нет (или он чужой).
export async function handleAnswer(chatId: string, senderMaxUserId: string | undefined, rawAnswer: string): Promise<boolean> {
    const session = await db.dialogSession.findUnique({ where: { chatId } });
    if (!session) return false;
    const owner = (session.data as Record<string, unknown>)[OWNER_KEY];
    if (typeof owner === 'string' && owner !== senderMaxUserId) return false;

    const flow = vacancyFlow;
    const step = flow.steps[session.step];
    if (!step) {
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
        return true;
    }

    // Все ответы собраны — сессию удаляем до onComplete. При сбое сообщаем пользователю, а не молчим.
    await db.dialogSession.deleteMany({ where: { chatId } });
    try {
        const resultText = await flow.onComplete(chatId, data);
        await maxApi.sendMessage(chatId, resultText);
    } catch (err) {
        console.error('dialog onComplete failed', chatId, flow.name, err);
        await maxApi.sendMessage(
            chatId,
            'Что-то пошло не так при сохранении вакансии. Попробуйте создать её заново командой /новая_вакансия.'
        ).catch(() => {});
    }

    return true;
}
