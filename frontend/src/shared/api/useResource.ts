import { useEffect, useState } from 'react'

type Result<T> =
  { state: 'ready'; data: T } | { state: 'error'; error: unknown } | { state: 'loading' }
export function useResource<T>(load: (signal: AbortSignal) => Promise<T>, key: string) {
  const [revision, setRevision] = useState(0)
  const stamp = `${key}:${revision}`
  const [snapshot, setSnapshot] = useState<{ stamp: string; result: Result<T> }>()
  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setSnapshot({ stamp, result: { state: 'ready', data } })
      },
      (error) => {
        if (!controller.signal.aborted) setSnapshot({ stamp, result: { state: 'error', error } })
      },
    )
    return () => controller.abort()
  }, [load, stamp])
  return {
    result: snapshot?.stamp === stamp ? snapshot.result : ({ state: 'loading' } as Result<T>),
    reload: () => setRevision((value) => value + 1),
    replace: (data: T) => setSnapshot({ stamp, result: { state: 'ready', data } }),
  }
}
