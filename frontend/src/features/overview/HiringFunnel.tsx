import { Link } from 'react-router-dom'
import { ArrowRight, RefreshCw } from 'lucide-react'
import { applicationLabels } from '../../entities/hiring'
import { statuses } from '../applications/api'
import type { HiringSummary } from './loadSummary'
import './overview.css'

export function HiringFunnel({
  summary,
  loading,
  failed,
  reload,
}: {
  summary?: HiringSummary
  loading: boolean
  failed: boolean
  reload: () => void
}) {
  const partial = Boolean(
    summary &&
    (summary.total === null || statuses.some((status) => summary.stages[status] === null)),
  )
  const empty = summary?.total === 0 && statuses.every((status) => summary.stages[status] === 0)
  return (
    <section className="hiring-funnel" aria-labelledby="funnel-title" aria-busy={loading}>
      <div className="section-title">
        <h2 id="funnel-title">Воронка найма</h2>
        <Link to="/applications">
          Все отклики <ArrowRight size={15} />
        </Link>
      </div>
      <p className="funnel-intro">
        Текущие этапы по всем вакансиям, включая закрытые. Выберите этап, чтобы открыть отклики.
      </p>
      <div className="funnel-stages">
        {statuses.map((status) => {
          const value = summary?.stages[status]
          const label = loading
            ? 'загружается'
            : value == null
              ? 'недоступно'
              : value.toLocaleString('ru-RU')
          return (
            <Link
              key={status}
              className={`funnel-stage funnel-stage-${status}`}
              to={`/applications?status=${status}`}
              aria-label={`${applicationLabels[status]}: ${label}. Открыть отклики`}
            >
              <span>
                {applicationLabels[status]}
                <ArrowRight size={15} aria-hidden="true" />
              </span>
              <strong>{value == null ? '—' : value.toLocaleString('ru-RU')}</strong>
              <small>{loading ? 'Загружаем…' : value == null ? 'Нет данных' : 'Откликов'}</small>
            </Link>
          )
        })}
      </div>
      <div className="funnel-footer">
        <p role="status">
          {loading
            ? 'Загружаем количество откликов по этапам…'
            : failed
              ? 'Не удалось загрузить количество откликов.'
              : partial
                ? 'Часть показателей недоступна. Загруженные данные показаны выше.'
                : empty
                  ? 'Откликов пока нет. Поделитесь опубликованной карточкой вакансии в MAX.'
                  : 'Считаем отклики, а не уникальных кандидатов. После изменений в чате обновите сводку.'}
        </p>
        <button type="button" className="dashboard-refresh" disabled={loading} onClick={reload}>
          <RefreshCw size={14} aria-hidden="true" />
          {failed || partial ? 'Повторить' : 'Обновить воронку'}
        </button>
      </div>
    </section>
  )
}
