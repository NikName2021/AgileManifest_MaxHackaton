import { ApiError, requestJson } from '../../shared/api/client'
import { authUrl } from '../session/auth'

export interface SalaryBenchmarkData {
  avgSalaryMin: number | null
  avgSalaryMax: number | null
  vacancyCount: number
  isFresh: boolean
  scope?: 'region' | 'country'
  regionName?: string | null
}
export interface BenchmarkQuery {
  position: string
  region: string
}
export interface BenchmarkRepository {
  get(query: BenchmarkQuery, signal?: AbortSignal): Promise<SalaryBenchmarkData>
}

function isAmount(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)
}
export function parseBenchmark(body: unknown): SalaryBenchmarkData {
  if (!body || typeof body !== 'object') throw new ApiError('contract')
  const value = body as Record<string, unknown>
  if (
    !isAmount(value.avgSalaryMin) ||
    !isAmount(value.avgSalaryMax) ||
    typeof value.vacancyCount !== 'number' ||
    !Number.isSafeInteger(value.vacancyCount) ||
    value.vacancyCount < 0 ||
    typeof value.isFresh !== 'boolean'
  )
    throw new ApiError('contract')
  // The bounds are independent averages of different subsets, not one salary range.
  if (value.scope !== undefined && !['region', 'country'].includes(String(value.scope)))
    throw new ApiError('contract')
  if (
    value.scope === 'region' &&
    (typeof value.regionName !== 'string' || !value.regionName.trim())
  )
    throw new ApiError('contract')
  return {
    avgSalaryMin: value.avgSalaryMin,
    avgSalaryMax: value.avgSalaryMax,
    vacancyCount: value.vacancyCount,
    isFresh: value.isFresh,
    ...(value.scope
      ? {
          scope: value.scope as 'region' | 'country',
          regionName: value.scope === 'region' ? (value.regionName as string) : null,
        }
      : {}),
  }
}

export function createBenchmarkRepository(base: string): BenchmarkRepository {
  return {
    async get({ position, region }, signal) {
      const title = position.trim(),
        regionCode = region.trim()
      if (!title || title.length > 200 || !regionCode || regionCode.length > 100)
        throw new ApiError('contract')
      const url = new URL(authUrl(base, '/api/benchmark', import.meta.env.PROD))
      url.searchParams.set('region_code', regionCode)
      // Despite its name, category is the upstream search text, not the vacancy's industry.
      url.searchParams.set('category', title)
      return parseBenchmark(await requestJson(url.toString(), { signal }))
    },
  }
}
