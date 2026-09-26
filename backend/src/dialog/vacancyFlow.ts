import type { DialogFlow } from './types.js';
import { publishVacancy } from '../vacancies/publish.js';
import { buildVacancyCardText, MAX_CARD_TEXT_LIMIT } from '../vacancies/cardText.js';
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

// Если собранные ответы дают карточку длиннее лимита MAX (4000 символов, см. cardText.ts) — не
// блокируем весь 6-шаговый диалог и не роняем создание вакансии, а укорачиваем requirements
// (единственное практически неограниченное по факту поле среди собранных в диалоге) до тех пор,
// пока карточка не влезет. Работодатель всегда может уточнить/дописать текст позже через
// PATCH /api/vacancies/:id (там та же самая проверка длины, см. validation.ts).
function fitRequirementsToCardLimit(fields: {
    title: string;
    regionCode: string;
    schedule: string;
    salaryMin: number | null;
    salaryMax: number | null;
    requirements: string;
    contactInfo: string;
}): { requirements: string; truncated: boolean } {
    const withFullText = buildVacancyCardText({
        title: fields.title,
        regionCode: fields.regionCode,
        schedule: fields.schedule,
        salaryMin: fields.salaryMin,
        salaryMax: fields.salaryMax,
        description: fields.requirements,
        contactInfo: fields.contactInfo,
    });
    if (withFullText.length <= MAX_CARD_TEXT_LIMIT) {
        return { requirements: fields.requirements, truncated: false };
    }

    let requirements = fields.requirements;
    while (requirements.length > 0) {
        const candidateText = buildVacancyCardText({
            title: fields.title,
            regionCode: fields.regionCode,
            schedule: fields.schedule,
            salaryMin: fields.salaryMin,
            salaryMax: fields.salaryMax,
            description: requirements,
            contactInfo: fields.contactInfo,
        });
        if (candidateText.length <= MAX_CARD_TEXT_LIMIT) break;
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
        const employer = await db.user.findFirst({ where: { chatId } });
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
                // Контакт — отдельное поле (раздел 3.3 хендоффа), а не часть description, чтобы
                // REST мог отдавать/принимать его как структурированное значение, а не парсить текст.
                contactInfo: data.contact,
                status: 'draft',
                // Застываем сразу же — это тот самый чат, где идёт этот диалог, гарантированно верно.
                employerChatId: chatId,
            },
        });

        // Бенчмарк — best-effort: если trudvsem недоступен, просто не показываем блок, вакансию это не ломает
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
