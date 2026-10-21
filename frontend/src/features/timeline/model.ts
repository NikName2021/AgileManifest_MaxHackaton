import { ApiError } from '../../shared/api/client'

export const timelineKeys = [
  'applied',
  'viewed',
  'contacted',
  'invited',
  'shift_confirmed',
  'hired',
] as const
export type TimelineKey = (typeof timelineKeys)[number]
export interface TimelineStep {
  key: TimelineKey
  emoji: string
  label: string
  hint: string
  state: 'done' | 'current' | 'upcoming' | 'skipped'
  reachedAt: string | null
}
export interface ApplicationTimeline {
  current: TimelineKey
  steps: TimelineStep[]
  outcome: {
    key: 'hired' | 'rejected' | 'vacancy_closed'
    emoji: string
    label: string
    reachedAt: string | null
  } | null
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError('contract')
  return value as Record<string, unknown>
}
function text(value: unknown): string {
  if (typeof value !== 'string') throw new ApiError('contract')
  return value
}
function date(value: unknown): string | null {
  if (value === null) return null
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)))
    throw new ApiError('contract')
  return value
}
export function parseTimeline(value: unknown): ApplicationTimeline {
  const data = record(value)
  if (
    !timelineKeys.includes(data.current as TimelineKey) ||
    !Array.isArray(data.steps) ||
    data.steps.length !== timelineKeys.length
  )
    throw new ApiError('contract')
  const steps = data.steps.map((value, index) => {
    const step = record(value)
    if (
      step.key !== timelineKeys[index] ||
      !['done', 'current', 'upcoming', 'skipped'].includes(String(step.state))
    )
      throw new ApiError('contract')
    return {
      key: timelineKeys[index],
      label: text(step.label),
      emoji: text(step.emoji),
      hint: text(step.hint),
      state: step.state as TimelineStep['state'],
      reachedAt: date(step.reachedAt),
    }
  })
  const outcome = data.outcome === null ? null : record(data.outcome)
  if (outcome && !['hired', 'rejected', 'vacancy_closed'].includes(String(outcome.key)))
    throw new ApiError('contract')
  return {
    current: data.current as TimelineKey,
    steps,
    outcome: outcome
      ? {
          key: outcome.key as NonNullable<ApplicationTimeline['outcome']>['key'],
          emoji: text(outcome.emoji),
          label: text(outcome.label),
          reachedAt: date(outcome.reachedAt),
        }
      : null,
  }
}
