import { OWNER_KEY, type DialogFlow } from './types.js';
import { publishVacancy } from '../vacancies/publish.js';
import { vacancyCardTextLength, MAX_CARD_TEXT_LIMIT } from '../vacancies/cardText.js';
import { getBenchmark, formatBenchmarkText } from '../trudvsem/benchmarkService.js';
import { db } from '../db.js';
import { SCHEDULE_ENUM } from '../validation.js';

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
    // Убираем разделитель тысяч ("40 000", "40.000", "40,000"), иначе "40 000–60 000" даст четыре числа.
    const compact = text.replace(/[\s.,](?=\d{3}(\D|$))/g, '');
    const numbers = compact.match(/\d+/g);
    if (!numbers || numbers.length === 0) {
        return { ok: false as const, error: 'Не понял вилку зарплаты. Напишите, например, "40000-60000" или "не знаю".' };
    }
    const nums = numbers.map(Number);
    return { ok: true as const, value: { min: Math.min(...nums), max: Math.max(...nums) } };
}

const SCHEDULE_VALUES: Set<string> = new Set(SCHEDULE_ENUM.options);
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
    return {
        ok: false as const,
        error: 'Выберите график кнопкой ниже или напишите одно из: сезонная, временная, постоянная.',
    };
}

// Карточка длиннее лимита MAX не должна срывать весь диалог — укорачиваем requirements,
// самое длинное поле, пока карточка не влезет. Полный текст можно задать позже через PATCH.
function fitRequirementsToCardLimit(fields: {
    title: string;
    regionCode: string;
    schedule: string;
    salaryMin: number | null;
    salaryMax: number | null;
    requirements: string;
    contactInfo: string;
}): { requirements: string; truncated: boolean } {
    // Длина считается с резервом под ссылку «Откликнуться» (ID вакансии ещё неизвестен).
    const fullLength = vacancyCardTextLength({
        title: fields.title,
        regionCode: fields.regionCode,
        schedule: fields.schedule,
        salaryMin: fields.salaryMin,
        salaryMax: fields.salaryMax,
        description: fields.requirements,
        contactInfo: fields.contactInfo,
    });
    if (fullLength <= MAX_CARD_TEXT_LIMIT) {
        return { requirements: fields.requirements, truncated: false };
    }

    let requirements = fields.requirements;
    while (requirements.length > 0) {
        const candidateLength = vacancyCardTextLength({
            title: fields.title,
            regionCode: fields.regionCode,
            schedule: fields.schedule,
            salaryMin: fields.salaryMin,
            salaryMax: fields.salaryMax,
            description: requirements,
            contactInfo: fields.contactInfo,
        });
        if (candidateLength <= MAX_CARD_TEXT_LIMIT) break;
        requirements = requirements.slice(0, Math.max(0, requirements.length - 100));
    }
    return { requirements: requirements.trim(), truncated: true };
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
        // Сессии, начатые до появления OWNER_KEY, — по-старому, через chatId.
        const owner = data[OWNER_KEY];
        const employer = typeof owner === 'string'
            ? await db.user.findUnique({ where: { maxUserId: owner } })
            : await db.user.findFirst({ where: { chatId } });
        if (!employer) {
            return 'Не нашёл вас в базе — попробуйте написать /новая_вакансия ещё раз.';
        }

        const { requirements, truncated } = fitRequirementsToCardLimit({
            title: data.title,
            regionCode: data.region,
            schedule: data.schedule,
            salaryMin: data.salary?.min ?? null,
            salaryMax: data.salary?.max ?? null,
            requirements: data.requirements,
            contactInfo: data.contact,
        });

        const vacancy = await db.vacancy.create({
            data: {
                employerUserId: employer.id,
                title: data.title,
                regionCode: data.region, // TODO: сопоставить со справочником регионов trudvsem
                category: 'general',      // TODO: добавить шаг выбора категории, когда появится справочник
                schedule: data.schedule,
                salaryMin: data.salary?.min ?? null,
                salaryMax: data.salary?.max ?? null,
                description: requirements,
                contactInfo: data.contact,
                status: 'draft',
                employerChatId: chatId,
            },
        });

        // Без данных trudvsem блок просто не показывается.
        const benchmark = await getBenchmark(vacancy.regionCode, vacancy.title.toLowerCase().trim());
        const benchmarkText = formatBenchmarkText(benchmark);
        const truncatedNotice = truncated
            ? 'Требования пришлось сократить — вместе с остальными полями карточка превышала лимит MAX в 4000 символов. Полный текст можно указать позже через мини-апп (PATCH вакансии).'
            : undefined;

        try {
            await publishVacancy(vacancy.id);
        } catch (err) {
            console.error('failed to publish vacancy from dialog', vacancy.id, err);
            return [
                'Вакансия сохранена, но карточку с кнопкой «Откликнуться» отправить не получилось — попробуйте ещё раз чуть позже.',
                `ID вакансии: ${vacancy.id}. Опубликовать повторно можно через POST /api/vacancies/${vacancy.id}/publish.`,
                truncatedNotice,
            ].filter(Boolean).join('\n\n');
        }

        return [
            'Вакансия сохранена и опубликована карточкой выше — с кнопкой «Откликнуться».',
            'Как только кто-то откликнется, вы получите уведомление в этом чате.',
            benchmarkText,
            truncatedNotice,
            `ID вакансии: ${vacancy.id}.`,
        ].filter(Boolean).join('\n\n');
    },
};
