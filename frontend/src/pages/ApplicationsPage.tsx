import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button } from '@maxhub/max-ui'
import { ArrowLeft, ArrowRight, BriefcaseBusiness, RefreshCw, UsersRound } from 'lucide-react'
import { applicationLabels, type Application } from '../entities/hiring'
import { useSession } from '../features/session/context'
import {
  isApplicationStatus,
  statuses,
  type ApplicationPage,
  type VacancyApplications,
} from '../features/applications/api'
import {
  applicationError,
  candidateContact,
  candidateName,
  parsePositiveInteger,
  type StatusNotice,
} from '../features/applications/model'
import { ApplicationDialog } from '../features/applications/ApplicationDialog'
import { useResource } from '../shared/api/useResource'

const pageSize = 20
type Loaded =
  { kind: 'page'; page: ApplicationPage } | { kind: 'vacancy'; data: VacancyApplications }
export function ApplicationsPage() {
  const { applications, vacancies, mode, loadApplicationExamples } = useSession()
  const [params, setParams] = useSearchParams()
  const rawStatus = params.get('status')
  const status = isApplicationStatus(rawStatus) ? rawStatus : undefined
  const vacancyId = parsePositiveInteger(params.get('vacancy'))
  const requestedPage = Math.min(parsePositiveInteger(params.get('page')) ?? 1, 1000000)
  const remoteOffset = vacancyId ? 0 : (requestedPage - 1) * pageSize
  const remoteStatus = vacancyId ? undefined : status
  const load = useCallback(
    async (signal: AbortSignal): Promise<Loaded> =>
      vacancyId
        ? { kind: 'vacancy', data: await applications.forVacancy(vacancyId, signal) }
        : {
            kind: 'page',
            page: await applications.list(
              { limit: pageSize, offset: remoteOffset, status: remoteStatus },
              signal,
            ),
          },
    [applications, vacancyId, remoteOffset, remoteStatus],
  )
  const { result, reload } = useResource(
    load,
    `${vacancyId ?? 'all'}:${remoteStatus ?? 'all'}:${remoteOffset}`,
  )
  const vacancyOptions = useResource(vacancies.list, 'application-vacancies')
  const [selected, setSelected] = useState<Application | null>(null)
  const [notice, setNotice] = useState<StatusNotice>()
  const [seeding, setSeeding] = useState(false)
  const [seedFailure, setSeedFailure] = useState('')
  const seedLock = useRef(false)
  const mounted = useRef(true)
  const listHeading = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const scoped =
    result.state === 'ready' && result.data.kind === 'vacancy' ? result.data.data : undefined
  const scopedRows = scoped?.items.filter((item) => !status || item.status === status) ?? []
  const serverPage =
    result.state === 'ready' && result.data.kind === 'page' ? result.data.page : undefined
  const total = serverPage?.total ?? scopedRows.length
  const lastPage = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.min(requestedPage, lastPage)
  const rows =
    serverPage?.items ?? scopedRows.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  useEffect(() => {
    if (result.state !== 'ready' || requestedPage <= lastPage) return
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        if (lastPage === 1) next.delete('page')
        else next.set('page', String(lastPage))
        return next
      },
      { replace: true },
    )
  }, [result.state, requestedPage, lastPage, setParams])

  function filter(key: string, value: string) {
    setNotice(undefined)
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        next.delete('page')
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true },
    )
  }
  function changePage(page: number) {
    setParams((previous) => {
      const next = new URLSearchParams(previous)
      if (page === 1) next.delete('page')
      else next.set('page', String(page))
      return next
    })
    listHeading.current?.scrollIntoView({ block: 'start' })
    listHeading.current?.focus({ preventScroll: true })
  }
  async function loadDemo() {
    if (seedLock.current || !loadApplicationExamples || mode !== 'preview') return
    seedLock.current = true
    setSeeding(true)
    setSeedFailure('')
    try {
      await loadApplicationExamples()
      if (mounted.current) {
        setParams({})
        reload()
        vacancyOptions.reload()
      }
    } catch {
      if (mounted.current) setSeedFailure('Не удалось загрузить пример. Попробуйте ещё раз.')
    } finally {
      seedLock.current = false
      if (mounted.current) setSeeding(false)
    }
  }
  const options = vacancyOptions.result.state === 'ready' ? vacancyOptions.result.data : []
  return (
    <>
      <div className="page-heading applications-heading">
        <div>
          <div className="eyebrow">Кабинет работодателя</div>
          <h1>Отклики кандидатов</h1>
          <p>Контакты кандидатов и текущие этапы найма.</p>
        </div>
        <span className="heading-badge">
          <UsersRound size={16} />
          Воронка найма
        </span>
      </div>
      {mode === 'preview' && loadApplicationExamples && (
        <div className="applications-demo">
          <p>Посмотрите, как устроена работа с кандидатами, на демонстрационных откликах.</p>
          <Button
            variant="secondary"
            size="small"
            disabled={seeding}
            onClick={() => void loadDemo()}
          >
            {seeding ? 'Загружаем…' : 'Загрузить демо-отклики'}
          </Button>
          {seedFailure && <p role="alert">{seedFailure}</p>}
        </div>
      )}
      <div className="applications-toolbar">
        <div className="application-vacancy-filter">
          <label htmlFor="application-vacancy">Вакансия</label>
          <select
            id="application-vacancy"
            value={vacancyId ?? ''}
            onChange={(event) => filter('vacancy', event.target.value)}
          >
            <option value="">Все вакансии</option>
            {vacancyId && !options.some((v) => v.id === vacancyId) && (
              <option value={vacancyId}>
                {scoped?.vacancy.title ?? `Вакансия № ${vacancyId}`}
              </option>
            )}
            {options.map((v) => (
              <option key={v.id} value={v.id}>
                {v.title}
                {v.status === 'closed' ? ' · закрыта' : ''}
              </option>
            ))}
          </select>
        </div>
        <Button
          variant="secondary"
          iconBefore={<RefreshCw size={16} />}
          disabled={result.state === 'loading'}
          onClick={() => {
            setNotice(undefined)
            reload()
            vacancyOptions.reload()
          }}
        >
          Обновить
        </Button>
      </div>
      {vacancyOptions.result.state === 'error' && (
        <p className="application-options-error" role="status">
          Список вакансий недоступен.{' '}
          <button type="button" onClick={vacancyOptions.reload}>
            Повторить загрузку списка
          </button>
        </p>
      )}
      <div className="application-funnel" role="group" aria-label="Фильтр по этапу найма">
        <button type="button" aria-pressed={!status} onClick={() => filter('status', '')}>
          Все отклики
        </button>
        {statuses.map((value, index) => (
          <button
            type="button"
            key={value}
            className={`funnel-${value}`}
            aria-pressed={status === value}
            onClick={() => filter('status', value)}
          >
            <span>{index + 1}</span>
            {applicationLabels[value]}
          </button>
        ))}
      </div>
      {scoped && (
        <div className="application-scope">
          <BriefcaseBusiness size={16} />
          <span>{scoped.vacancy.title}</span>
          <Link to={`/vacancies/${scoped.vacancy.id}`}>Открыть вакансию</Link>
        </div>
      )}
      {notice && (
        <div
          className={`application-notice ${notice.tone}`}
          role={notice.tone === 'warning' ? 'alert' : 'status'}
        >
          {notice.text}
        </div>
      )}
      {result.state === 'loading' && (
        <div className="vacancy-loading" role="status">
          <span className="loading-dot" />
          Загружаем отклики…
        </div>
      )}
      {result.state === 'error' && (
        <div className="application-notice error" role="alert">
          <p>{applicationError(result.error)}</p>
          <Button variant="secondary" onClick={reload}>
            Повторить загрузку откликов
          </Button>
        </div>
      )}
      {result.state === 'ready' && (
        <>
          <p className="application-results" role="status" tabIndex={-1} ref={listHeading}>
            {total
              ? `Найдено: ${total} · Показаны ${(currentPage - 1) * pageSize + 1}–${Math.min((currentPage - 1) * pageSize + rows.length, total)}`
              : 'Найдено: 0'}
          </p>
          {rows.length ? (
            <ul className="applications-list">
              {rows.map((item) => (
                <li key={item.id}>
                  <article className="application-row">
                    <div className="candidate-avatar" aria-hidden="true">
                      {candidateName(item).slice(0, 1).toLocaleUpperCase('ru')}
                    </div>
                    <div className="application-row-main">
                      <h2>{candidateName(item)}</h2>
                      <Link
                        className="application-vacancy-link"
                        to={`/vacancies/${item.vacancyId}`}
                      >
                        {item.vacancy.title}
                      </Link>
                      <p>{candidateContact(item) || 'Контакт не указан'}</p>
                    </div>
                    <div className="application-row-meta">
                      <span className={`application-status ${item.status}`}>
                        {applicationLabels[item.status]}
                      </span>
                      <time dateTime={item.createdAt}>
                        {new Date(item.createdAt).toLocaleDateString('ru-RU', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </time>
                      <Button
                        variant="secondary"
                        size="small"
                        aria-label={`Открыть отклик: ${candidateName(item)}`}
                        onClick={() => {
                          setNotice(undefined)
                          setSelected(item)
                        }}
                      >
                        Подробнее
                      </Button>
                    </div>
                  </article>
                </li>
              ))}
            </ul>
          ) : (
            <section className="vacancy-empty">
              <span className="step-icon">
                <UsersRound size={27} />
              </span>
              <h2>{status ? 'На этом этапе пока нет откликов' : 'Пока нет откликов'}</h2>
              <p>
                {status
                  ? 'Выберите другой этап или сбросьте фильтр.'
                  : 'Поделитесь опубликованной карточкой вакансии в MAX. Когда кандидаты оставят контакты, они появятся здесь.'}
              </p>
              {status ? (
                <Button variant="secondary" onClick={() => filter('status', '')}>
                  Показать все этапы
                </Button>
              ) : (
                <Button asChild className="primary-button">
                  <Link to={vacancyId ? `/vacancies/${vacancyId}` : '/vacancies'}>К вакансиям</Link>
                </Button>
              )}
            </section>
          )}
          {total > pageSize && (
            <nav className="applications-pagination" aria-label="Страницы откликов">
              <Button
                variant="secondary"
                size="small"
                disabled={currentPage <= 1}
                iconBefore={<ArrowLeft size={16} />}
                onClick={() => changePage(currentPage - 1)}
              >
                Назад
              </Button>
              <span>
                Страница {currentPage} из {lastPage}
              </span>
              <Button
                variant="secondary"
                size="small"
                disabled={currentPage >= lastPage}
                iconAfter={<ArrowRight size={16} />}
                onClick={() => changePage(currentPage + 1)}
              >
                Далее
              </Button>
            </nav>
          )}
        </>
      )}
      {selected && (
        <ApplicationDialog
          key={selected.id}
          application={selected}
          onClose={() => setSelected(null)}
          onChanged={(message) => {
            setNotice(message)
            reload()
          }}
        />
      )}
    </>
  )
}
