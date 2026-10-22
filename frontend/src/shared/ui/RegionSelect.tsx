import { Button } from '@maxhub/max-ui'
import { Select } from './Select'
import { useRegions } from '../api/useRegions'

export function RegionSelect({
  value,
  onChange,
  disabled = false,
}: {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  const { result, reload } = useRegions()
  return (
    <div className="candidate-input">
      <label>
        Регион
        <Select
          label="Регион"
          value={value}
          disabled={disabled || result.state !== 'ready'}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Вся Россия</option>
          {result.state === 'ready' && !result.data.some((r) => r.code === value) && value && (
            <option value={value}>{value}</option>
          )}
          {result.state === 'ready' &&
            result.data.map((r) => (
              <option key={r.code} value={r.code}>
                {r.name}
              </option>
            ))}
        </Select>
      </label>
      {result.state === 'loading' && <small role="status">Загружаем регионы…</small>}
      {result.state === 'error' && (
        <p role="alert">
          Регионы не загружены.{' '}
          <Button type="button" variant="secondary" onClick={reload}>
            Повторить загрузку регионов
          </Button>
        </p>
      )}
    </div>
  )
}
