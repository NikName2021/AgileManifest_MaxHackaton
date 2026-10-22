import { useCallback } from 'react'
import { useSession } from '../../features/session/context'
import { getRegions } from './regions'
import { useResource } from './useResource'

export function useRegionName() {
  const { mode } = useSession()
  const load = useCallback((signal: AbortSignal) => getRegions(mode === 'preview', signal), [mode])
  const { result } = useResource(load, 'region-names')
  return (value: string | null | undefined) => {
    if (!value) return 'Регион не указан'
    return result.state === 'ready'
      ? (result.data.find((region) => region.code === value)?.name ?? value)
      : value
  }
}
