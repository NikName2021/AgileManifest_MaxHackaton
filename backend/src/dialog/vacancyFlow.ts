import type { DialogFlow } from './types.js';
import { publishVacancy } from '../vacancies/publish.js';
import { getBenchmark, formatBenchmarkText } from '../trudvsem/benchmarkService.js';
import { db } from '../db.js';

function notEmpty(raw: string) {
    const value = raw.trim();
    if (!value) return { ok: false as const, error: 'Пустой ответ не подходит, напишите ещё раз.' };
    return { ok: true as const, value };
}

function parseSalary(raw: string) {
    const text = raw.trim().toLowerCase();
    if (text === 'не знаю' || text === 'не важно' || text === '-') {
        return { ok: true as const, value: { min: null, max: null } };
    }
    // Убираем пробел/точку/запятую перед группой ровно из 3 цифр (разделитель тысяч: "40 000",
    // "40.000", "40,000"), иначе "40 000–60 000" распадается на 4 отдельные группы (40, 000, 60,
    // 000) вместо двух чисел — старая версия из-за этого возвращала абсурдные вилки вроде 0–100,
    // а для одиночного "100 000" вообще давала min=0.
    const compact = text.replace(/[\s.,](?=\d{3}(\D|$))/g, '');
    const numbers = compact.match(/\d+/g);
    if (!numbers || numbers.length === 0) {
        return { ok: false as const, error: 'Не понял вилку зарплаты. Напишите, например, "40000-60000" или "не знаю".' };
    }
    const nums = numbers.map(Number);
    return { ok: true as const, value: { min: Math.min(...nums), max: Math.max(...nums) } };
}

const SCHEDULE_VALUES = new Set(['seasonal', 'temporary', 'permanent']);
const SCHEDULE_LABELS: Record<string, string> = {
    'сезонная': 'seasonal',
    'временная': 'temporary',
    'постоянная': 'permanent',
};

function parseSchedule(raw: string) {
    const trimmed = raw.trim();
    if (SCHEDULE_VALUES.has(trimmed)) return { ok: true as const, value: trimmed };
    const byLabel = SCHEDULE_LABELS[trimmed.toLowerCase()];
    if (byLabel) return { ok: true as const, value: byLabel };
    // Раньше у этого шага не было parse вообще — принимался любой текст, включая опечатки,
    // который потом попадал в карточку вакансии как есть.
    return {
        ok: false as const,
        error: 'Выберите график кнопкой ниже или напишите одно из: сезонная, временная, постоянная.',
    };
}

export const vacancyFlow: DialogFlow = {
    name: 'new_vacancy',
    steps: [
        { key: 'title', prompt: 'Какая должность? Например: «Сборщик урожая» или «Официант на лето».', parse: notEmpty },
        { key: 'region', prompt: 'В каком регионе или городе нужен человек?', parse: notEmpty },
        {
            key: 'schedule',
            prompt: 'Какой график работы?',
            buttons: [
                [{ text: 'Сезонная', value: 'seasonal' }, { text: 'Временная', value: 'temporary' }],
                [{ text: 'Постоянная', value: 'permanent' }],
            ],
            parse: parseSchedule,
        },
        { key: 'salary', prompt: 'Какая вилка зарплаты? Например «40000-60000», или напишите «не знаю» — подскажу ориентир по рынку.', parse: parseSalary },
        { key: 'requirements', prompt: 'Кратко — какие требования к кандидату? Если неважно, напишите «нет».', parse: notEmpty },
        { key: 'contact', prompt: 'Контакт для связи с откликнувшимися: телефон или юзернейм в MAX.', parse: notEmpty },
    ],

    async onComplete(chatId, data) {
        const employer = await db.user.findFirst({ where: { chatId } });
        if (!employer) {
            return 'Не нашёл вас в базе — попробуйте написать /новая_вакансия ещё раз.';
        }

        const vacancy = await db.vacancy.create({
            data: {
                employerUserId: employer.id,
                title: data.title,
                regionCode: data.region, // TODO: сопоставить со справочником регионов trudvsem
                category: 'general',      // TODO: добавить шаг выбора категории, когда появится справочник
                schedule: data.schedule,
                salaryMin: data.salary?.min ?? null,
                salaryMax: data.salary?.max ?? null,
                description: `${data.requirements}\n\nКонтакт: ${data.contact}`,
                status: 'draft',
                // Застываем сразу же — это тот самый чат, где идёт этот диалог, гарантированно верно.
                employerChatId: chatId,
            },
        });

        // Бенчмарк — best-effort: если trudvsem недоступен, просто не показываем блок, вакансию это не ломает
        const benchmark = await getBenchmark(vacancy.regionCode, vacancy.title.toLowerCase().trim());
        const benchmarkText = formatBenchmarkText(benchmark);

        try {
            await publishVacancy(vacancy.id);
        } catch (err) {
            console.error('failed to publish vacancy from dialog', vacancy.id, err);
            return [
                'Вакансия сохранена, но карточку с кнопкой «Откликнуться» отправить не получилось — попробуйте ещё раз чуть позже.',
                `ID вакансии: ${vacancy.id}. Опубликовать повторно можно через POST /api/vacancies/${vacancy.id}/publish.`,
            ].join('\n\n');
        }

        return [
            'Вакансия сохранена и опубликована карточкой выше — с кнопкой «Откликнуться».',
            'Как только кто-то откликнется, вы получите уведомление в этом чате.',
            benchmarkText,
            `ID вакансии: ${vacancy.id}.`,
        ].filter(Boolean).join('\n\n');
    },
};
