import { withTrudvsemRateLimit } from './rateLimiter.js';

const BASE = 'https://opendata.trudvsem.ru/api/v1/vacancies';

export interface TrudvsemVacancy {
    salary_min?: number;
    salary_max?: number;
}

interface TrudvsemResponse {
    status: string;
    meta?: { total: number };
    results?: { vacancies?: { vacancy: TrudvsemVacancy }[] };
}

// TODO: структура запроса/ответа — по публичной документации opendata.trudvsem.ru,
// не проверено живым вызовом. Сверить перед финальной сдачей (раздел 8 ТЗ).
export async function searchTrudvsemVacancies(query: string, limit = 100): Promise<TrudvsemVacancy[]> {
    const url = new URL(BASE);
    url.searchParams.set('text', query);
    url.searchParams.set('limit', String(limit));

    const res = await withTrudvsemRateLimit(() => fetch(url.toString()));
    if (!res.ok) {
        throw new Error(`trudvsem API -> ${res.status}`);
    }

    const data = (await res.json()) as TrudvsemResponse;
    return (data.results?.vacancies ?? []).map((v) => v.vacancy);
}