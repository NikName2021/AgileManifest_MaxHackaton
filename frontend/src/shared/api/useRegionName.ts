import { useRegions } from './useRegions'

export function useRegionName() {
  const { result } = useRegions()
  return (value: string | null | undefined) => {
    if (!value) return 'Регион не указан'
    return result.state === 'ready'
      ? (result.data.find((region) => region.code === value)?.name ?? value)
      : value
  }
}
