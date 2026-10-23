import { useCallback } from 'react'
import { useSession } from '../../features/session/context'
import { getRegions } from './regions'
import { useResource } from './useResource'

export function useRegions() {
  const { mode } = useSession()
  const load = useCallback((signal: AbortSignal) => getRegions(mode === 'preview', signal), [mode])
  return useResource(load, 'directory:regions')
}
