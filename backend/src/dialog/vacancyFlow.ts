import type { DialogFlow } from './types.js';
import { publishVacancyCard } from '../vacancies/publish.js';
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
    const numbers = text.match(/\d+/g);
    if (!numbers || numbers.length === 0) {
        return { ok: false as const, error: 'Не понял вилку зарплаты. Напишите, например, "40000-60000" или "не знаю".' };
    }
    const nums = numbers.map(Number);
    return { ok: true as const, value: { min: Math.min(...nums), max: Math.max(...nums) } };
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
                status: 'published',
            },
        });

        await publishVacancyCard(vacancy);

        // Бенчмарк — best-effort: если trudvsem недоступен, просто не показываем блок, вакансию это не ломает
        const benchmark = await getBenchmark(vacancy.regionCode, vacancy.title.toLowerCase().trim());
        const benchmarkText = formatBenchmarkText(benchmark);

        return [
            'Вакансия сохранена и опубликована карточкой выше — с кнопкой «Откликнуться».',
            'Как только кто-то откликнется, вы получите уведомление в этом чате.',
            benchmarkText,
            `ID вакансии: ${vacancy.id}.`,
        ].filter(Boolean).join('\n\n');
    },
};