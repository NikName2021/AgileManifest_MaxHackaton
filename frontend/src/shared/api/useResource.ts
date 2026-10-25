import { useCallback, useContext, useMemo, useState } from 'react'
import { QueryClientContext, useQuery } from '@tanstack/react-query'
import { ApiError } from './client'
import { createResourceClient } from './resourceClient'

type Result<T> =
  { state: 'ready'; data: T } | { state: 'error'; error: unknown } | { state: 'loading' }

export function useResourceClient() {
  const shared = useContext(QueryClientContext)
  // Isolated consumers, including component tests, work without an app provider.
  const [local] = useState(() => (shared ? null : createResourceClient()))
  return shared ?? local!
}

export function useInvalidateResources() {
  const client = useResourceClient()
  return useCallback(() => {
    // Mark other screens stale without resetting forms currently being edited.
    void client.invalidateQueries({ refetchType: 'none' })
  }, [client])
}

export function useResource<T>(load: (signal: AbortSignal) => Promise<T>, key: string) {
  const client = useResourceClient()
  const queryKey = useMemo(() => ['resource', key], [key])
  const query = useQuery({ queryKey, queryFn: ({ signal }) => load(signal) }, client)
  const denied =
    query.error instanceof ApiError &&
    (query.error.kind === 'unauthorized' ||
      query.error.kind === 'forbidden' ||
      query.error.status === 404)
  const result = useMemo<Result<T>>(() => {
    if (denied) return { state: 'error', error: query.error }
    if (query.data !== undefined) return { state: 'ready', data: query.data }
    if (query.isError) return { state: 'error', error: query.error }
    return { state: 'loading' }
  }, [denied, query.data, query.isError, query.error])
  const refresh = useCallback(() => {
    void client.refetchQueries({ queryKey, exact: true }, { cancelRefetch: false })
  }, [client, queryKey])
  return {
    result,
    isRefreshing: result.state === 'ready' && query.isFetching,
    refreshError:
      result.state === 'ready' && !query.isFetching ? (query.error ?? undefined) : undefined,
    reload: refresh,
    refresh,
    refetch: query.refetch,
    replace: useCallback(
      (data: T) => {
        void client.cancelQueries({ queryKey, exact: true })
        client.setQueryData(queryKey, data)
      },
      [client, queryKey],
    ),
  }
}
