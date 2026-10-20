import { db } from '../db.js';
import { searchTrudvsemVacancies } from './client.js';
import { normalizeRegion, regionByCode, trudvsemRegionCode } from '../regions/dictionary.js';

const CACHE_TTL_HOURS = 24;
// Меньше вакансий с зарплатой в регионе — ориентир ненадёжен, берём всю Россию.
const MIN_REGION_SAMPLE = 5;
const COUNTRY_KEY = '';

export interface Benchmark {
    avgSalaryMin: number | null;
    avgSalaryMax: number | null;
    // Сколько найденных вакансий указали зарплату — по ним и считается среднее.
    vacancyCount: number;
    isFresh: boolean;
    scope: 'region' | 'country';
    regionName: string | null;
}

interface Sample {
    avgSalaryMin: number | null;
    avgSalaryMax: number | null;
    vacancyCount: number;
    isFresh: boolean;
}

function average(values: (number | undefined)[]): number | null {
    const positive = values.filter((v): v is number => typeof v === 'number' && v > 0);
    return positive.length ? Math.round(positive.reduce((a, b) => a + b, 0) / positive.length) : null;
}

async function loadSample(cacheKey: string, category: string, regionCode13?: string): Promise<Sample | null> {
    const cached = await db.benchmarkCache.findUnique({
        where: { regionCode_category: { regionCode: cacheKey, category } },
    });
    const fromCache = (isFresh: boolean): Sample => ({
        avgSalaryMin: cached!.avgSalaryMin,
        avgSalaryMax: cached!.avgSalaryMax,
        vacancyCount: cached!.vacancyCount ?? 0,
        isFresh,
    });
    if (cached && Date.now() - cached.fetchedAt.getTime() < CACHE_TTL_HOURS * 3600 * 1000) return fromCache(true);

    try {
        const vacancies = (await searchTrudvsemVacancies(category, regionCode13)).filter(
            (v) => (v.salary_min ?? 0) > 0 || (v.salary_max ?? 0) > 0
        );
        const sample = {
            avgSalaryMin: average(vacancies.map((v) => v.salary_min)),
            avgSalaryMax: average(vacancies.map((v) => v.salary_max)),
            vacancyCount: vacancies.length,
        };
        await db.benchmarkCache.upsert({
            where: { regionCode_category: { regionCode: cacheKey, category } },
            update: { ...sample, fetchedAt: new Date() },
            create: { regionCode: cacheKey, category, ...sample },
        });
        return { ...sample, isFresh: true };
    } catch {
        // trudvsem недоступен — отдаём устаревший кэш, если он есть.
        return cached ? fromCache(false) : null;
    }
}

// region — свободный текст или код субъекта; category — текст поиска (обычно название должности).
export async function getBenchmark(region: string, category: string): Promise<Benchmark | null> {
    const code = normalizeRegion(region);
    if (code) {
        const regional = await loadSample(code, category, trudvsemRegionCode(code));
        if (regional && regional.vacancyCount >= MIN_REGION_SAMPLE) {
            return { ...regional, scope: 'region', regionName: regionByCode(code)!.name };
        }
    }
    const country = await loadSample(COUNTRY_KEY, category);
    return country ? { ...country, scope: 'country', regionName: null } : null;
}

export function formatBenchmarkText(
    benchmark: Benchmark | null,
): string | undefined {
    if (!benchmark || benchmark.vacancyCount === 0) return undefined;

    const marketText = benchmark.avgSalaryMin && benchmark.avgSalaryMax
        ? `${benchmark.avgSalaryMin}–${benchmark.avgSalaryMax} ₽`
        : benchmark.avgSalaryMin
          ? `от ${benchmark.avgSalaryMin} ₽`
          : 'недостаточно данных для точной вилки';
    const where = benchmark.scope === 'region' ? ` в регионе «${benchmark.regionName}»` : ' по России';
    const staleness = benchmark.isFresh ? '' : ' (кэш, свежий запрос не удался)';

    return `Ориентир по рынку по ${benchmark.vacancyCount} похожим вакансиям${where} с «Работы России»${staleness}: ${marketText}.`;
}
