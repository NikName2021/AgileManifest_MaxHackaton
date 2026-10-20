import { withTrudvsemRateLimit } from './rateLimiter.js';

const BASE = 'https://opendata.trudvsem.ru/api/v1/vacancies';
const REQUEST_TIMEOUT_MS = 8_000;

export interface TrudvsemVacancy {
    salary_min?: number;
    salary_max?: number;
}

interface TrudvsemResponse {
    status: string;
    meta?: { total: number };
    results?: { vacancies?: { vacancy: TrudvsemVacancy }[] };
}

// Проверено живым вызовом 20.10.2026: /vacancies и /vacancies/region/<13 цифр>, параметр text;
// пустой результат — 200 с results: {}.
export async function searchTrudvsemVacancies(query: string, regionCode13?: string, limit = 100): Promise<TrudvsemVacancy[]> {
    const url = new URL(regionCode13 ? `${BASE}/region/${regionCode13}` : BASE);
    url.searchParams.set('text', query);
    url.searchParams.set('limit', String(limit));

    const res = await withTrudvsemRateLimit(() =>
        fetch(url.toString(), { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
    );
    if (!res.ok) {
        throw new Error(`trudvsem API -> ${res.status}`);
    }

    const data = (await res.json()) as TrudvsemResponse;
    return (data.results?.vacancies ?? []).map((v) => v.vacancy);
}
