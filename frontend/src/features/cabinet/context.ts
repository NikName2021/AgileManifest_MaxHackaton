import { createContext, useContext } from 'react'
export type Cabinet = 'employer' | 'worker' | 'partner'
export const CabinetContext = createContext<{ cabinet: Cabinet; switchCabinet: () => void } | null>(
  null,
)
export function useCabinet() {
  const value = useContext(CabinetContext)
  if (!value) throw new Error('Cabinet provider missing')
  return value
}
