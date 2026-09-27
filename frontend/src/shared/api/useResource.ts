import { useCallback, useEffect, useState } from 'react'
import { ApiError } from './client'

type Result<T> =
  { state: 'ready'; data: T } | { state: 'error'; error: unknown } | { state: 'loading' }
export function useResource<T>(load: (signal: AbortSignal) => Promise<T>, key: string) {
  const [revision, setRevision] = useState(0)
  const [check, setCheck] = useState(0)
  const stamp = `${key}:${revision}`
  const [snapshot, setSnapshot] = useState<{
    stamp: string
    check: number
    result: Result<T>
    refreshError?: unknown
  }>()
  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted)
          setSnapshot({ stamp, check, result: { state: 'ready', data } })
      },
      (error) => {
        if (!controller.signal.aborted)
          setSnapshot((previous) =>
            previous?.stamp === stamp &&
            previous.result.state === 'ready' &&
            !(
              error instanceof ApiError &&
              (error.kind === 'unauthorized' || error.kind === 'forbidden' || error.status === 404)
            )
              ? { ...previous, check, refreshError: error }
              : { stamp, check, result: { state: 'error', error } },
          )
      },
    )
    return () => controller.abort()
  }, [load, stamp, check])
  const result = snapshot?.stamp === stamp ? snapshot.result : ({ state: 'loading' } as Result<T>)
  return {
    result,
    isRefreshing: result.state === 'ready' && snapshot?.check !== check,
    refreshError:
      snapshot?.stamp === stamp && snapshot.check === check ? snapshot.refreshError : undefined,
    reload: useCallback(() => setRevision((value) => value + 1), []),
    // Keep a successful snapshot visible while checking for changes in the background.
    refresh: useCallback(() => setCheck((value) => value + 1), []),
    replace: (data: T) => setSnapshot({ stamp, check, result: { state: 'ready', data } }),
  }
}
