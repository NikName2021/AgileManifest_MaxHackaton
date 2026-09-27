import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '@maxhub/max-ui'
import { ChartNoAxesColumnIncreasing } from 'lucide-react'
import { useSession } from '../session/context'
import type { BenchmarkQuery, SalaryBenchmarkData } from './api'
import './benchmark.css'

type State = { kind: 'idle' | 'loading' | 'error' } | { kind: 'ready'; data: SalaryBenchmarkData }
const money = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 0,
})

export function SalaryBenchmark({ position, region }: BenchmarkQuery) {
  const query = { position: position.trim(), region: region.trim() }
  // Reset results immediately on a changed query; late responses cannot label another job.
  return <BenchmarkPanel key={JSON.stringify(query)} {...query} />
}

function BenchmarkPanel({ position, region }: BenchmarkQuery) {
  const { benchmark, mode } = useSession()
  const [state, setState] = useState<State>({ kind: 'idle' })
  const pending = useRef<AbortController | null>(null)
  const headingId = useId()
  const hintId = useId()
  const valid = Boolean(position && region && position.length <= 200 && region.length <= 100)
  const demo = mode === 'preview'
  useEffect(() => () => pending.current?.abort(), [])

  async function load() {
    if (!valid || pending.current) return
    const controller = new AbortController()
    pending.current = controller
    setState({ kind: 'loading' })
    try {
      const data = await benchmark.get({ position, region }, controller.signal)
      if (!controller.signal.aborted) setState({ kind: 'ready', data })
    } catch {
      if (!controller.signal.aborted) setState({ kind: 'error' })
    } finally {
      if (pending.current === controller) pending.current = null
    }
  }

  return (
    <section className="salary-benchmark" aria-labelledby={headingId}>
      <div className="benchmark-heading">
        <ChartNoAxesColumnIncreasing size={20} aria-hidden="true" />
        <h3 id={headingId}>Ориентир по зарплате</h3>
        {demo && <span className="benchmark-demo">Демо</span>}
      </div>
      <p className="benchmark-intro">
        Средние границы зарплат в вакансиях «Работы России» по названию должности, без фильтра по
        региону.
      </p>
      {demo && (
        <p className="benchmark-hint">
          В демо показан фиксированный пример, а не реальные данные по вашей вакансии.
        </p>
      )}
      <p className="benchmark-hint" id={hintId}>
        {valid ? <>Запрос: «{position}».</> : 'Для запроса заполните название и регион вакансии.'}
      </p>
      <div
        className="benchmark-result"
        aria-live="polite"
        aria-atomic="true"
        aria-busy={state.kind === 'loading'}
      >
        {state.kind === 'loading' && <p>Получаем ориентир… Можно продолжать заполнять вакансию.</p>}
        {state.kind === 'error' && (
          <p className="benchmark-warning">
            Сейчас ориентир недоступен. Попробуйте позже — вакансию можно сохранить и опубликовать
            без него.
          </p>
        )}
        {state.kind === 'ready' && (
          <>
            {!state.data.isFresh && (
              <p className="benchmark-warning">
                Источник временно недоступен. Показаны сохранённые данные, которые могли устареть.
              </p>
            )}
            {state.data.vacancyCount === 0 ? (
              <p>В выборке нет вакансий. Попробуйте другое название должности.</p>
            ) : (
              <>
                <dl className="benchmark-amounts">
                  <div>
                    <dt>Средняя нижняя граница</dt>
                    <dd>
                      {state.data.avgSalaryMin === null
                        ? 'Нет данных'
                        : money.format(state.data.avgSalaryMin)}
                    </dd>
                  </div>
                  <div>
                    <dt>Средняя верхняя граница</dt>
                    <dd>
                      {state.data.avgSalaryMax === null
                        ? 'Нет данных'
                        : money.format(state.data.avgSalaryMax)}
                    </dd>
                  </div>
                </dl>
                <p className="benchmark-hint">
                  Вакансий в выборке: {state.data.vacancyCount.toLocaleString('ru-RU')}. Это размер
                  выборки, а не всего рынка.
                </p>
                {state.data.avgSalaryMin === null && state.data.avgSalaryMax === null && (
                  <p>Вакансии найдены, но данных о зарплате для расчёта нет.</p>
                )}
              </>
            )}
            <p className="benchmark-hint">
              Границы усредняются отдельно по вакансиям с указанной суммой. Период оплаты и учёт
              налогов не указаны — учитывайте это при сравнении.
            </p>
          </>
        )}
      </div>
      <div className="benchmark-actions">
        <Button
          type="button"
          variant="secondary"
          disabled={!valid || state.kind === 'loading'}
          aria-describedby={hintId}
          onClick={() => void load()}
        >
          {state.kind === 'loading'
            ? 'Загружаем…'
            : state.kind === 'error'
              ? 'Повторить запрос'
              : state.kind === 'ready'
                ? 'Обновить ориентир'
                : 'Посмотреть ориентир'}
        </Button>
        <a href="https://trudvsem.ru/" target="_blank" rel="noopener noreferrer">
          Работа России ↗
        </a>
      </div>
    </section>
  )
}
