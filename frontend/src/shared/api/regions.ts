import { ApiError, requestJson } from './client'
import { authUrl } from '../../features/session/auth'
import { config } from '../config'

export interface Region {
  code: string
  name: string
}
export function parseRegions(body: unknown): Region[] {
  if (!body || typeof body !== 'object' || !('items' in body) || !Array.isArray(body.items))
    throw new ApiError('contract')
  return body.items.map((item: unknown) => {
    if (
      !item ||
      typeof item !== 'object' ||
      !('code' in item) ||
      !('name' in item) ||
      typeof item.code !== 'string' ||
      !item.code ||
      typeof item.name !== 'string' ||
      !item.name.trim()
    )
      throw new ApiError('contract')
    return { code: item.code, name: item.name }
  })
}
export async function getRegions(preview: boolean, signal?: AbortSignal): Promise<Region[]> {
  if (preview)
    return [
      { code: '23', name: 'Краснодарский край' },
      { code: '71', name: 'Тульская область' },
      { code: '78', name: 'Санкт-Петербург' },
    ]
  return parseRegions(
    await requestJson(authUrl(config.apiBaseUrl, '/api/regions', import.meta.env.PROD), { signal }),
  )
}
