export const successfulHireThreshold = 5
export function hasEmployerBadge(count: number | undefined) {
  return (
    typeof count === 'number' && Number.isSafeInteger(count) && count >= successfulHireThreshold
  )
}
