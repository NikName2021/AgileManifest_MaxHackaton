import { Select } from '../shared/ui/Select'
import { useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { useSession } from '../features/session/context'
import { applicationLabels } from '../entities/hiring'
import { isApplicationStatus, statuses } from '../features/applications/api'
import { Contact } from '../features/applications/CandidateContacts'
import { useResource } from '../shared/api/useResource'
import { useRefreshOnReturn } from '../shared/api/useRefreshOnReturn'
import { RefreshStatus } from '../shared/ui/RefreshStatus'
import { CandidateError, JobFacts, Loading, Pagination } from '../features/candidate/ui'
import { offsetFrom, pageSize } from '../features/candidate/query'

export function MyApplicationsPage() {
  const { candidate } = useSession(),
    [params, setParams] = useSearchParams()
  const raw = params.get('status'),
    status = isApplicationStatus(raw) ? raw : undefined
  const offset = offsetFrom(params.get('offset'))
  const load = useCallback(
    (signal: AbortSignal) => candidate.applications({ status, limit: pageSize, offset }, signal),
    [candidate, status, offset],
  )
  const resource = useResource(load, `${status}:${offset}`)
  useRefreshOnReturn(resource.refresh)
  const { result } = resource
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">КАБИНЕТ РАБОТНИКА</span>
          <h1>Мои отклики</h1>
          <p>Ответы работодателей и контакты по вакансиям, на которые вы откликнулись.</p>
        </div>
      </div>
      <label className="candidate-input candidate-status-filter">
        Этап рассмотрения
        <Select
          label="Этап рассмотрения"
          value={status ?? ''}
          onChange={(event) => setParams(event.target.value ? { status: event.target.value } : {})}
        >
          <option value="">Все отклики</option>
          {statuses.map((s) => (
            <option value={s} key={s}>
              {applicationLabels[s]}
            </option>
          ))}
        </Select>
      </label>
      <div className="history-layout">
        <div>
          <RefreshStatus
            refreshing={resource.isRefreshing}
            failed={!!resource.refreshError}
            retry={resource.refresh}
          />
          {result.state === 'loading' && <Loading />}
          {result.state === 'error' && (
            <CandidateError error={result.error} retry={resource.reload} />
          )}
          {result.state === 'ready' && (
            <>
              <p className="candidate-result-count" role="status">
                Откликов: {result.data.total}
              </p>
              <div className="job-list">
                {result.data.items.map((application) => (
                  <article key={application.id} className="job-list-item">
                    <div className="candidate-application-heading">
                      <h2>{application.vacancy.title}</h2>
                      <span className={`application-status ${application.status}`}>
                        {applicationLabels[application.status]}
                      </span>
                    </div>
                    <JobFacts job={application.vacancy} />
                    {application.vacancy.status !== 'published' && (
                      <p className="vacancy-notice">
                        Вакансия больше не принимает отклики. Ваш отклик остаётся в истории.
                      </p>
                    )}
                    <p>
                      Отправлен {new Date(application.createdAt).toLocaleDateString('ru-RU')}.
                      Обновлён {new Date(application.updatedAt).toLocaleString('ru-RU')}.
                    </p>
                    <details className="candidate-application-details">
                      <summary>Условия и контакты</summary>
                      <div className="vacancy-description">
                        {application.vacancy.description || 'Описание не добавлено.'}
                      </div>
                      <h3>Контакт работодателя</h3>
                      {application.vacancy.contactInfo ? (
                        <Contact value={application.vacancy.contactInfo} />
                      ) : (
                        <p>
                          Работодатель не указал контакт. Он может связаться с вами по вашему
                          отклику.
                        </p>
                      )}
                      <h3>Вы отправили</h3>
                      <p className="candidate-contact-value">
                        {application.contact || 'Контакт не был указан'}
                      </p>
                    </details>
                    {application.vacancy.status === 'published' && (
                      <Link className="text-link" to={`/jobs/${application.vacancy.id}`}>
                        Открыть вакансию →
                      </Link>
                    )}
                  </article>
                ))}
              </div>
              {!result.data.items.length && (
                <section className="empty-panel">
                  <h2>
                    {status
                      ? 'Нет откликов на этом этапе'
                      : offset
                        ? 'На этой странице нет откликов'
                        : 'Вы ещё не откликались'}
                  </h2>
                  <p>Найдите подходящую вакансию и отправьте работодателю свой контакт.</p>
                  <Link className="text-link" to="/jobs">
                    Посмотреть вакансии →
                  </Link>
                </section>
              )}
              <Pagination
                {...result.data}
                onPage={(pageOffset) => {
                  const next = new URLSearchParams(params)
                  next.set('offset', String(pageOffset))
                  setParams(next)
                }}
              />
            </>
          )}
        </div>
        <aside className="status-guide">
          <h2>Что означают статусы</h2>
          {statuses.map((stage) => (
            <div className="status-guide-item" key={stage}>
              <span className={`status-dot ${stage}`} />
              <div>
                <strong>{applicationLabels[stage]}</strong>
                <p>
                  {
                    {
                      new: 'Работодатель получил отклик.',
                      contacted: 'Началось общение с работодателем.',
                      invited: 'Уточните детали встречи или выхода.',
                      hired: 'Работодатель отметил вас как нанятого.',
                      rejected: 'Работодатель завершил рассмотрение отклика.',
                    }[stage]
                  }
                </p>
              </div>
            </div>
          ))}
          <small>Закрытые вакансии остаются в истории.</small>
        </aside>
      </div>
    </>
  )
}
