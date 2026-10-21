import { Select } from '../shared/ui/Select'
import { useCallback, useState } from 'react'
import { Button } from '@maxhub/max-ui'
import { Link, useSearchParams } from 'react-router-dom'

import { useSession } from '../features/session/context'
import { applicationLabels } from '../entities/hiring'
import { isApplicationStatus, statuses } from '../features/applications/api'
import { useResource } from '../shared/api/useResource'
import { useRefreshOnReturn } from '../shared/api/useRefreshOnReturn'
import { RefreshStatus } from '../shared/ui/RefreshStatus'
import { CandidateError, JobFacts, Loading, Pagination } from '../features/candidate/ui'
import { offsetFrom, pageSize } from '../features/candidate/query'
import { ShiftSummary } from '../features/shifts/ShiftSummary'
import { ApplicationRoadmap } from '../features/timeline/ApplicationRoadmap'
import { Modal } from '../shared/ui/Modal'
import { JobOverview } from '../features/candidate/JobOverview'
import type { MyApplication } from '../features/candidate/api'

export function MyApplicationsPage() {
  const [archived, setArchived] = useState<MyApplication | null>(null)
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
          <p>Ответы работодателей и условия вакансий, на которые вы откликнулись.</p>
        </div>
      </div>
      <div className="candidate-input candidate-status-filter">
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
      </div>
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
                  <article key={application.id} className="job-list-item history-card linked-card">
                    <div className="candidate-application-heading">
                      {application.vacancy.status === 'published' ? (
                        <Link className="card-main-link" to={`/jobs/${application.vacancy.id}`}>
                          <h2>{application.vacancy.title}</h2>
                        </Link>
                      ) : (
                        <Button
                          variant="ghost"
                          className="card-main-link archived-title"
                          onClick={() => setArchived(application)}
                        >
                          <h2>{application.vacancy.title}</h2>
                        </Button>
                      )}
                      <span className={`application-status ${application.status}`}>
                        {applicationLabels[application.status]}
                      </span>
                    </div>
                    <JobFacts job={application.vacancy} />
                    <ShiftSummary shift={application} worker />
                    {application.vacancy.status !== 'published' && (
                      <p className="vacancy-notice">
                        Вакансия больше не принимает отклики. Ваш отклик остаётся в истории.
                      </p>
                    )}
                    <details className="candidate-application-details">
                      <summary>Условия и ваш отклик</summary>
                      <div className="vacancy-description">
                        {application.vacancy.description || 'Описание не добавлено.'}
                      </div>
                      <h3>Вы отправили</h3>
                      <p className="candidate-contact-value">
                        {application.contact || 'Контакт не был указан'}
                      </p>
                    </details>
                    <ApplicationRoadmap timeline={application.timeline} />
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
      </div>
      {archived && (
        <Modal title="Вакансия из истории" onClose={() => setArchived(null)}>
          <div className="job-detail archived-job">
            <JobOverview job={archived.vacancy} />
            <p>Набор завершён. Условия сохранены в вашем отклике.</p>
          </div>
        </Modal>
      )}
    </>
  )
}
