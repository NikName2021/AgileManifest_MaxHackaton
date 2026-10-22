import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button } from '@maxhub/max-ui'
import { ArrowRight, Copy, Plus } from 'lucide-react'
import { Select } from '../shared/ui/Select'
import { Modal } from '../shared/ui/Modal'
import { Toast } from '../shared/ui/Toast'
import { Pill } from '../shared/ui/Pill'
import { displayDate, initials } from '../shared/format'
import { applicationChanged } from '../shared/api/applicationEvents'
import { applicationLabels, type Application } from '../entities/hiring'
import { useSession } from '../features/session/context'
import { isApplicationStatus } from '../features/applications/api'
import { candidateName, parsePositiveInteger } from '../features/applications/model'
import { ApplicationDialog } from '../features/applications/ApplicationDialog'
import { StageFilters } from '../features/applications/StageFilters'
import { loadHiringSummary, loadVacancyHiringSummary } from '../features/overview/loadSummary'
import { useResource } from '../shared/api/useResource'
import { useRefreshOnReturn } from '../shared/api/useRefreshOnReturn'
import { RefreshStatus } from '../shared/ui/RefreshStatus'
import { CandidateError, Loading, Pagination } from '../features/candidate/ui'

export function ApplicationsPage() {
  const { applications, vacancies, mode, loadApplicationExamples } = useSession()
  const [params, setParams] = useSearchParams()
  const raw = params.get('status'),
    status = isApplicationStatus(raw) ? raw : undefined
  const vacancyId = parsePositiveInteger(params.get('vacancy'))
  const offset = ((parsePositiveInteger(params.get('page')) ?? 1) - 1) * 20
  const load = useCallback(
    async (signal: AbortSignal) => {
      if (!vacancyId) return applications.list({ status, limit: 20, offset }, signal)
      const data = await applications.forVacancy(vacancyId, signal)
      const rows = data.items.filter((a) => !status || a.status === status)
      return { items: rows.slice(offset, offset + 20), total: rows.length, limit: 20, offset }
    },
    [applications, vacancyId, status, offset],
  )
  const resource = useResource(load, `${vacancyId}:${status}:${offset}`)
  const options = useResource(vacancies.list, 'application-vacancies')
  const loadCounts = useCallback(
    (signal: AbortSignal) =>
      vacancyId
        ? loadVacancyHiringSummary(applications, vacancyId, signal)
        : loadHiringSummary(applications, signal),
    [applications, vacancyId],
  )
  const counts = useResource(loadCounts, String(vacancyId))
  const [selected, setSelected] = useState<Application | null>(null)
  const [notice, setNotice] = useState('')
  const [sharing, setSharing] = useState(false)
  const [demoBusy, setDemoBusy] = useState(false)
  const { refresh: refreshRows } = resource,
    { refresh: refreshCounts } = counts,
    { refresh: refreshOptions } = options
  const refresh = useCallback(() => {
    refreshRows()
    refreshCounts()
    refreshOptions()
  }, [refreshRows, refreshCounts, refreshOptions])
  useRefreshOnReturn(refresh, selected !== null)
  const jobs = options.result.state === 'ready' ? options.result.data : []
  const published = jobs.filter((v) => v.status === 'published' && v.applyUrl)
  const result = resource.result
  useEffect(() => {
    if (result.state === 'ready' && offset > 0 && offset >= result.data.total)
      setParams(
        (p) => {
          const next = new URLSearchParams(p)
          const page = Math.max(1, Math.ceil(result.data.total / 20))
          if (page > 1) next.set('page', String(page))
          else next.delete('page')
          return next
        },
        { replace: true },
      )
  }, [result, offset, setParams])
  function filter(key: string, value: string) {
    setParams((p) => {
      const next = new URLSearchParams(p)
      next.delete('page')
      if (value) next.set(key, value)
      else next.delete(key)
      return next
    })
  }
  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setNotice('Ссылка скопирована')
      setSharing(false)
    } catch {
      setNotice('Не удалось скопировать ссылку')
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">КАБИНЕТ РАБОТОДАТЕЛЯ</div>
          <h1>Отклики</h1>
        </div>
      </div>
      {mode === 'preview' && loadApplicationExamples && (
        <Button
          variant="ghost"
          disabled={demoBusy}
          onClick={async () => {
            setDemoBusy(true)
            try {
              await loadApplicationExamples()
              refresh()
              applicationChanged()
            } catch {
              setNotice('Не удалось загрузить примеры')
            } finally {
              setDemoBusy(false)
            }
          }}
        >
          Загрузить демо-отклики
        </Button>
      )}
      {counts.result.state !== 'ready' || counts.result.data.total !== 0 ? (
        <div className="filter-carousel application-filter-row">
          {(jobs.length > 1 || (vacancyId && !jobs.some((v) => v.id === vacancyId))) && (
            <Select
              label="Вакансия"
              className="compact-filter"
              value={vacancyId ?? ''}
              onChange={(e) => filter('vacancy', e.target.value)}
            >
              <option value="">Все вакансии</option>
              {jobs.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.title}
                </option>
              ))}
              {vacancyId && !jobs.some((v) => v.id === vacancyId) && (
                <option value={vacancyId}>Вакансия № {vacancyId}</option>
              )}
            </Select>
          )}
          <StageFilters
            value={status}
            counts={counts.result.state === 'ready' ? counts.result.data : undefined}
            onChange={(s) => filter('status', s ?? '')}
          />
        </div>
      ) : null}
      {vacancyId && (
        <p>
          <Link className="text-link" to={`/vacancies/${vacancyId}`}>
            Открыть вакансию
          </Link>
        </p>
      )}
      <RefreshStatus
        refreshing={resource.isRefreshing}
        failed={!!resource.refreshError}
        retry={refresh}
      />
      {options.result.state === 'error' && (
        <CandidateError error={options.result.error} retry={options.reload} />
      )}
      {counts.result.state === 'error' && (
        <CandidateError error={counts.result.error} retry={counts.reload} />
      )}
      {result.state === 'loading' && <Loading label="Загружаем отклики…" />}
      {result.state === 'error' && <CandidateError error={result.error} retry={resource.reload} />}
      {result.state === 'ready' && (
        <>
          {result.data.items.length ? (
            <div className="employer-list application-rows">
              {result.data.items.map((item) => (
                <Button
                  variant="ghost"
                  className={`person-row ${item.status === 'new' ? 'has-new' : ''}`}
                  key={item.id}
                  aria-label={`Открыть отклик: ${candidateName(item)}`}
                  onClick={() => setSelected(item)}
                >
                  <span className="candidate-avatar">{initials(candidateName(item))}</span>
                  <span className="row-description">
                    <strong>{candidateName(item)}</strong>
                    <small>{item.vacancy.title}</small>
                  </span>
                  <time dateTime={item.createdAt}>{displayDate(item.createdAt)}</time>
                  <Pill tone={item.status}>{applicationLabels[item.status]}</Pill>
                  <ArrowRight size={18} />
                </Button>
              ))}
            </div>
          ) : (
            <section className="empty-panel">
              <h2>{status ? 'На этом этапе пока нет откликов' : 'Пока нет откликов'}</h2>
              <p>{status ? 'Выберите другой этап.' : 'Поделитесь ссылкой на вакансию в MAX.'}</p>
              {status ? (
                <Button variant="secondary" onClick={() => filter('status', '')}>
                  Показать все этапы
                </Button>
              ) : published.length ? (
                <Button
                  className="primary-button"
                  onClick={() => {
                    const target =
                      published.find((v) => v.id === vacancyId) ??
                      (published.length === 1 ? published[0] : null)
                    if (target) void copy(target.applyUrl!)
                    else setSharing(true)
                  }}
                >
                  <Copy size={18} />
                  Скопировать ссылку
                </Button>
              ) : (
                <Button asChild className="primary-button">
                  <Link to="/vacancies/new">
                    <Plus size={18} />
                    Создать вакансию
                  </Link>
                </Button>
              )}
            </section>
          )}
          <Pagination
            {...result.data}
            onPage={(next) =>
              setParams((p) => {
                const value = new URLSearchParams(p)
                if (next) value.set('page', String(next / 20 + 1))
                else value.delete('page')
                return value
              })
            }
          />
        </>
      )}
      {sharing && (
        <Modal title="Выберите вакансию" onClose={() => setSharing(false)}>
          <div className="selection-list">
            {published.map((v) => (
              <Button key={v.id} variant="secondary" onClick={() => void copy(v.applyUrl!)}>
                {v.title}
                <Copy size={18} />
              </Button>
            ))}
          </div>
        </Modal>
      )}
      {selected && (
        <ApplicationDialog
          key={selected.id}
          application={selected}
          onClose={() => setSelected(null)}
          onChanged={(message) => {
            setNotice(message.tone === 'success' ? 'Этап изменён' : message.text)
            refresh()
            applicationChanged()
          }}
        />
      )}
      {notice && !selected && <Toast message={notice} onClose={() => setNotice('')} />}
    </>
  )
}
