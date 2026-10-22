import { useId, useState } from 'react'
import { Button } from '@maxhub/max-ui'
import { Check, X } from 'lucide-react'
import type { ApplicationTimeline } from './model'

export function ApplicationRoadmap({ timeline }: { timeline?: ApplicationTimeline }) {
  const [active, setActive] = useState<string | null>(null)
  const id = useId()
  if (!timeline) return <p className="roadmap-unavailable">История этапов пока недоступна.</p>
  const terminal = timeline.outcome && timeline.outcome.key !== 'hired' ? timeline.outcome : null
  const currentIndex = timeline.steps.findIndex((step) => step.key === timeline.current)
  const steps = terminal ? timeline.steps.slice(0, currentIndex + 1) : timeline.steps
  const points = [
    ...steps,
    ...(terminal ? [{ ...terminal, hint: terminal.label, state: 'terminal' as const }] : []),
  ]
  return (
    <section className="application-roadmap" aria-label="Этапы отклика">
      <div className="roadmap-caption">
        <strong>{timeline.outcome?.label ?? timeline.steps[currentIndex]?.label}</strong>
        <span>
          {terminal ? 'Рассмотрение завершено' : `${currentIndex + 1} из ${timeline.steps.length}`}
        </span>
      </div>
      <ol className="roadmap-track">
        {points.map((step, index) => {
          const state = terminal && step.state === 'current' ? 'done' : step.state
          const description = step.reachedAt
            ? new Date(step.reachedAt)
                .toLocaleString('ru-RU', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })
                .replace(/(\d{2}):(\d{2})$/, '$1.$2')
            : step.state === 'skipped'
              ? 'Этап пропущен'
              : step.state === 'upcoming'
                ? 'Ещё впереди'
                : 'Время не указано'
          return (
            <li key={step.key} className={`roadmap-step ${state} stage-${step.key}`}>
              <Button
                type="button"
                variant="ghost"
                className="roadmap-point"
                aria-label={`${step.label}. ${description}`}
                aria-current={step.key === timeline.current && !terminal ? 'step' : undefined}
                aria-describedby={active === step.key ? `${id}-${step.key}` : undefined}
                onMouseEnter={() => setActive(step.key)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(step.key)}
                onBlur={() => setActive(null)}
                onClick={() => setActive(step.key)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setActive(null)
                }}
              >
                <span className="roadmap-dot" aria-hidden="true">
                  {state === 'done' ? (
                    <Check size={16} strokeWidth={2} />
                  ) : state === 'terminal' ? (
                    <X size={16} strokeWidth={2} />
                  ) : (
                    index + 1
                  )}
                </span>
              </Button>
              {active === step.key && (
                <div
                  id={`${id}-${step.key}`}
                  role="tooltip"
                  className={`roadmap-tooltip ${index === points.length - 1 ? 'align-end' : ''}`}
                >
                  <strong>
                    <span className="roadmap-event-icon" aria-hidden="true">
                      {step.emoji}
                    </span>
                    <span>{step.label}</span>
                  </strong>
                  <span>{description}</span>
                  <small>{step.hint}</small>
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
