import { StageFilters } from '../features/applications/StageFilters'
import { Contact } from '../features/applications/CandidateContacts'
import { displayDate } from '../shared/format'
import { useCallback, useState } from 'react'
import { Pill } from '../shared/ui/Pill'
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
  const loadCounts = useCallback(
    async (signal: AbortSignal) => {
      const values = await Promise.all(
        [undefined, ...statuses].map((status) =>
          candidate.applications({ status, limit: 1, offset: 0 }, signal),
        ),
      )
      return {
        total: values[0].total,
        stages: {
          new: values[1].total,
          contacted: values[2].total,
          invited: values[3].total,
          hired: values[4].total,
          rejected: values[5].total,
        },
      }
    },
    [candidate],
  )
  const counts = useResource(loadCounts, 'worker-stage-counts')
  useRefreshOnReturn(counts.refresh)
  const resource = useResource(load, `worker:applications:${status}:${offset}`)
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
      <StageFilters
        value={status}
        counts={counts.result.state === 'ready' ? counts.result.data : undefined}
        onChange={(s) => setParams(s ? { status: s } : {})}
      />
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
                      <Pill tone={`application-status ${application.status}`}>
                        {applicationLabels[application.status]}
                      </Pill>
                    </div>
                    <time dateTime={application.createdAt}>
                      {displayDate(application.createdAt)}
                    </time>
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
                      {application.vacancy.contactInfo &&
                        ['invited', 'hired'].includes(application.status) && (
                          <section>
                            <h3>Контакт работодателя</h3>
                            {application.vacancy.contactInfo.split(',').map((contact) => (
                              <Contact key={contact} value={contact.trim()} />
                            ))}
                          </section>
                        )}
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
