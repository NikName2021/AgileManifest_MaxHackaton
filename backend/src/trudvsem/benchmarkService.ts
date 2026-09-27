import { db } from '../db.js';
import { searchTrudvsemVacancies } from './client.js';

const CACHE_TTL_HOURS = 24;

export interface Benchmark {
    avgSalaryMin: number | null;
    avgSalaryMax: number | null;
    vacancyCount: number;
    isFresh: boolean;
}

export async function getBenchmark(regionCode: string, category: string): Promise<Benchmark | null> {
    const cached = await db.benchmarkCache.findUnique({
        where: { regionCode_category: { regionCode, category } },
    });

    const isFresh = !!cached && Date.now() - cached.fetchedAt.getTime() < CACHE_TTL_HOURS * 3600 * 1000;
    if (cached && isFresh) {
        return {
            avgSalaryMin: cached.avgSalaryMin,
            avgSalaryMax: cached.avgSalaryMax,
            vacancyCount: cached.vacancyCount ?? 0,
            isFresh: true,
        };
    }

    try {
        // TODO: сейчас ищем только по тексту должности, без привязки к коду региона trudvsem —
        // сопоставление свободного текста региона со справочником регионов trudvsem не сделано
        // (см. TODO в vacancyFlow.ts). Для MVP это осознанное упрощение.
        const vacancies = await searchTrudvsemVacancies(category);

        const mins = vacancies.map((v) => v.salary_min).filter((v): v is number => typeof v === 'number' && v > 0);
        const maxs = vacancies.map((v) => v.salary_max).filter((v): v is number => typeof v === 'number' && v > 0);

        const avgSalaryMin = mins.length ? Math.round(mins.reduce((a, b) => a + b, 0) / mins.length) : null;
        const avgSalaryMax = maxs.length ? Math.round(maxs.reduce((a, b) => a + b, 0) / maxs.length) : null;
        const vacancyCount = vacancies.length;

        await db.benchmarkCache.upsert({
            where: { regionCode_category: { regionCode, category } },
            update: { avgSalaryMin, avgSalaryMax, vacancyCount, fetchedAt: new Date() },
            create: { regionCode, category, avgSalaryMin, avgSalaryMax, vacancyCount },
        });

        return { avgSalaryMin, avgSalaryMax, vacancyCount, isFresh: true };
    } catch (err) {
        // trudvsem недоступен — отдаём то, что есть в кэше (пусть протухший), иначе молча пропускаем блок
        if (cached) {
            return {
                avgSalaryMin: cached.avgSalaryMin,
                avgSalaryMax: cached.avgSalaryMax,
                vacancyCount: cached.vacancyCount ?? 0,
                isFresh: false,
            };
        }
        return null;
    }
}

export function formatBenchmarkText(
    benchmark: Benchmark | null,
): string | undefined {
    if (!benchmark || benchmark.vacancyCount === 0) return undefined;

    const marketText = benchmark.avgSalaryMin && benchmark.avgSalaryMax
        ? `${benchmark.avgSalaryMin}–${benchmark.avgSalaryMax} ₽`
        : 'недостаточно данных для точной вилки';

    const staleness = benchmark.isFresh ? '' : ' (кэш, свежий запрос не удался)';

    return `Ориентир по рынку по ${benchmark.vacancyCount} похожим вакансиям с «Работы России»${staleness}: ${marketText}.`;
}