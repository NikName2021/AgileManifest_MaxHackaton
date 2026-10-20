import { createContext, useContext } from 'react'
import type { User } from '../../entities/hiring'
import type { MaxBridge } from '../../shared/max/bridge'
import type { VacancyRepository } from '../vacancies/api'
import type { ApplicationRepository } from '../applications/api'
import type { BenchmarkRepository } from '../benchmark/api'
import type { CandidateRepository } from '../candidate/api'
import type { SubscriptionRepository } from '../subscriptions/api'

export interface Session {
  subscriptions?: SubscriptionRepository
  user: User
  mode: 'preview' | 'max'
  bridge?: MaxBridge
  vacancies: VacancyRepository
  applications: ApplicationRepository
  benchmark: BenchmarkRepository
  candidate: CandidateRepository
  loadApplicationExamples?: () => Promise<void>
}
export const SessionContext = createContext<Session | null>(null)
export function useSession() {
  const session = useContext(SessionContext)
  if (!session) throw new Error('Session provider missing')
  return session
}
