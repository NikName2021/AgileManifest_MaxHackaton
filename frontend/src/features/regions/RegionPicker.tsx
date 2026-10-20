import { useCallback } from 'react'
import { Button } from '@maxhub/max-ui'
import { Select } from '../../shared/ui/Select'
import { ApiError, requestJson } from '../../shared/api/client'
import { useResource } from '../../shared/api/useResource'
import { config } from '../../shared/config'
import { authUrl } from '../session/auth'
import { useSession } from '../session/context'

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
      typeof item.name !== 'string' ||
      !item.name.trim()
    )
      throw new ApiError('contract')
    return { code: item.code, name: item.name }
  })
}
export function RegionPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const { mode } = useSession()
  const load = useCallback(
    async (signal: AbortSignal) =>
      mode === 'preview'
        ? [
            { code: '23', name: 'Краснодарский край' },
            { code: '71', name: 'Тульская область' },
            { code: '78', name: 'Санкт-Петербург' },
          ]
        : parseRegions(
            await requestJson(authUrl(config.apiBaseUrl, '/api/regions', import.meta.env.PROD), {
              signal,
            }),
          ),
    [mode],
  )
  const { result, reload } = useResource(load, 'regions')
  if (result.state === 'loading') return <p role="status">Загружаем справочник регионов…</p>
  if (result.state === 'error')
    return (
      <div className="vacancy-notice">
        <p>Справочник недоступен. Регион можно ввести вручную.</p>
        <Button type="button" variant="secondary" onClick={reload}>
          Загрузить регионы
        </Button>
      </div>
    )
  return (
    <div className="vacancy-field">
      <label htmlFor="region-directory">Выбрать регион из справочника</label>
      <Select
        id="region-directory"
        label="Выбрать регион из справочника"
        value={result.data.some((r) => r.name === value) ? value : ''}
        onChange={(e) => {
          if (e.target.value) onChange(e.target.value)
        }}
      >
        <option value="">Выберите субъект РФ</option>
        {result.data.map((r) => (
          <option key={r.code} value={r.name}>
            {r.name}
          </option>
        ))}
      </Select>
    </div>
  )
}
