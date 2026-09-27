import { useCallback } from 'react'
import type { Vacancy } from '../../entities/hiring'
import { useResource } from '../../shared/api/useResource'
import { useRefreshOnReturn } from '../../shared/api/useRefreshOnReturn'
import { RefreshStatus } from '../../shared/ui/RefreshStatus'
import { useSession } from '../session/context'
import { HiringFunnel } from './HiringFunnel'
import { loadVacancyHiringSummary } from './loadSummary'

export function VacancyHiringSummary({
  vacancy,
  paused,
}: {
  vacancy: Pick<Vacancy, 'id' | 'status'>
  paused: boolean
}) {
  const { applications } = useSession()
  const load = useCallback(
    (signal: AbortSignal) => loadVacancyHiringSummary(applications, vacancy.id, signal),
    [applications, vacancy.id],
  )
  const { result, refresh, isRefreshing, refreshError } = useResource(load, String(vacancy.id))
  useRefreshOnReturn(refresh, paused || result.state === 'loading' || isRefreshing)
  return (
    <div className="vacancy-hiring-summary">
      <RefreshStatus refreshing={isRefreshing} failed={Boolean(refreshError)} retry={refresh} />
      <HiringFunnel
        vacancy={vacancy}
        summary={result.state === 'ready' ? result.data : undefined}
        loading={result.state === 'loading'}
        refreshing={isRefreshing}
        failed={result.state === 'error'}
        reload={refresh}
      />
    </div>
  )
}
