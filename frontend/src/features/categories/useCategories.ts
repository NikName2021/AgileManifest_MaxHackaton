import { useCallback } from 'react'
import { useSession } from '../session/context'
import { useResource } from '../../shared/api/useResource'
import { loadCategories } from './api'
export function useCategories() {
  const { mode } = useSession()
  const load = useCallback(
    (signal: AbortSignal) => loadCategories(mode === 'preview', signal),
    [mode],
  )
  return useResource(load, 'categories')
}
