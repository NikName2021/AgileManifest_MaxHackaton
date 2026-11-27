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

// Вакансия портала целиком — для импорта в «Сезон» (поля по живому ответу API от 27.11.2026).
export interface TrudvsemFullVacancy {
    id: string;
    'job-name'?: string;
    region?: { region_code?: string; name?: string };
    company?: { name?: string; inn?: string; ogrn?: string };
    salary_min?: number;
    salary_max?: number;
    vac_url?: string;
    duty?: string;
    requirements?: string;
    schedule?: string;
    employment?: string;
    shift?: string[];
    category?: { specialisation?: string };
    typicalPosition?: string;
    requirement?: { experience?: number };
    contact_list?: { contact_type?: string; contact_value?: string }[];
    work_places?: number;
    addresses?: { address?: { location?: string }[] };
}

export type CompanyId = { inn: string } | { ogrn: string };

// Проверено живым вызовом 27.11.2026: /vacancies/company/<ОГРН> и /vacancies/company/inn/<ИНН>
// отдают только вакансии этой компании; не найдено — 200 с пустым results. Портал отвечает на эти
// запросы медленно (13–14 с в проверке), поэтому таймаут больше, чем у поиска.
const COMPANY_TIMEOUT_MS = 25_000;
export async function fetchCompanyVacancies(company: CompanyId, limit = 100): Promise<TrudvsemFullVacancy[]> {
    const path = 'inn' in company ? `company/inn/${company.inn}` : `company/${company.ogrn}`;
    const url = new URL(`${BASE}/${path}`);
    url.searchParams.set('limit', String(limit));
    const res = await withTrudvsemRateLimit(() => fetch(url.toString(), { signal: AbortSignal.timeout(COMPANY_TIMEOUT_MS) }));
    if (!res.ok) throw new Error(`trudvsem API -> ${res.status}`);
    const data = (await res.json()) as { results?: { vacancies?: { vacancy: TrudvsemFullVacancy }[] } };
    return (data.results?.vacancies ?? []).map((v) => v.vacancy).filter((v) => typeof v.id === 'string' && v.id.length > 0);
}
