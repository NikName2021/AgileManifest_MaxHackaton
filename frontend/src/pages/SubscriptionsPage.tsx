import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button, Switch } from '@maxhub/max-ui'
import { Trash2 } from 'lucide-react'
import { Toast } from '../shared/ui/Toast'
import { Input } from '../shared/ui/Input'
import { Select } from '../shared/ui/Select'
import { RegionSelect } from '../shared/ui/RegionSelect'
import { useSession } from '../features/session/context'
import { useResource } from '../shared/api/useResource'
import { CandidateError, Loading } from '../features/candidate/ui'
import { scheduleLabels } from '../features/vacancies/model'
import type { SubscriptionInput } from '../features/subscriptions/api'
import { config } from '../shared/config'
import { ApiError } from '../shared/api/client'

export function SubscriptionsPage() {
  const { subscriptions, candidate, mode } = useSession()
  const filters = useResource(candidate.filters, 'subscription-filters')
  const categories = filters.result.state === 'ready' ? filters.result.data.categories : []
  const [params] = useSearchParams()
  const [region, setRegion] = useState(params.get('region_code') ?? '')
  const load = useCallback((signal: AbortSignal) => subscriptions!.list(signal), [subscriptions])
  const resource = useResource(load, 'subscriptions')
  const [busy, setBusy] = useState(false),
    lock = useRef(false)
  const [error, setError] = useState<unknown>(),
    [message, setMessage] = useState('')
  const [validation, setValidation] = useState('')
  const [deleting, setDeleting] = useState<number | null>(null)
  const [uncertain, setUncertain] = useState(false)
  const data = resource.result.state === 'ready' ? resource.result.data : undefined
  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(() => setMessage(''), 4500)
    return () => window.clearTimeout(timer)
  }, [message])
  async function mutate(work: () => Promise<unknown>, success: string) {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError(undefined)
    setMessage('')
    try {
      await work()
      setMessage(success)
      setDeleting(null)
      resource.reload()
    } catch (e) {
      setError(e)
      resource.reload()
      if (!(e instanceof ApiError) || ['network', 'contract'].includes(e.kind) || e.status >= 500)
        setUncertain(true)
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget),
      rawSalary = String(form.get('salary') || '').trim()
    if (rawSalary && (!/^\d+$/.test(rawSalary) || Number(rawSalary) > 10000000)) {
      setValidation('Зарплата должна быть целой суммой от 0 до 10 000 000 ₽.')
      return
    }
    setValidation('')
    const input: SubscriptionInput = {
      region_code: region || null,
      category: String(form.get('category') || '').trim() || null,
      schedule: (form.get('schedule') || null) as SubscriptionInput['schedule'],
      salary_from: rawSalary ? Number(rawSalary) : null,
      student_only: form.get('student') === 'on',
    }
    void mutate(
      () => subscriptions!.create(input),
      mode === 'preview'
        ? 'Демо-подписка сохранена. Уведомления не отправляются.'
        : 'Подписка сохранена.',
    )
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">КАБИНЕТ РАБОТНИКА</span>
          <h1>Подписки на вакансии</h1>
          <p>
            Новые подходящие вакансии придут в личный чат с ботом. Можно сохранить до 5 подписок.
            {data && !data.hasBotChat && (
              <>
                {' '}
                Чтобы получать уведомления,{' '}
                {config.botUrl ? (
                  <a className="text-link" href={config.botUrl} target="_blank" rel="noreferrer">
                    откройте чат с ботом
                  </a>
                ) : (
                  'откройте чат с ботом в MAX'
                )}{' '}
                и нажмите «Начать».
              </>
            )}
          </p>
        </div>
      </div>
      {resource.result.state === 'loading' && <Loading />}
      {resource.result.state === 'error' && (
        <CandidateError error={resource.result.error} retry={resource.reload} />
      )}
      {error &&
        (error instanceof ApiError && error.code === 'subscription_limit_reached' ? (
          <p role="alert">Достигнут лимит: удалите одну из 5 подписок.</p>
        ) : (
          <CandidateError error={error} />
        ))}
      {message && <Toast message={message} onClose={() => setMessage('')} />}
      {data && (
        <>
          {uncertain && (
            <div role="alert">
              <p>
                Результат запроса был неизвестен. Проверьте список перед повторным сохранением,
                чтобы не создать дубликат.
              </p>
              <Button variant="secondary" onClick={() => setUncertain(false)}>
                Список проверен
              </Button>
            </div>
          )}
          <form className="subscription-form" onSubmit={submit}>
            <h2>Новая подписка</h2>
            <fieldset disabled={busy || data.items.length >= 5 || uncertain}>
              <RegionSelect
                value={region}
                onChange={setRegion}
                disabled={busy || uncertain || data.items.length >= 5}
              />
              <label>
                Сфера деятельности
                <Select
                  label="Сфера деятельности"
                  name="category"
                  defaultValue={params.get('category') ?? ''}
                  disabled={
                    busy || uncertain || data.items.length >= 5 || filters.result.state !== 'ready'
                  }
                >
                  <option value="">Любая сфера</option>
                  {params.get('category') &&
                    !categories.some((c) => c.value === params.get('category')) && (
                      <option value={params.get('category')!}>{params.get('category')}</option>
                    )}
                  {categories.map(({ value, label }) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </label>
              {filters.result.state === 'loading' && (
                <p role="status">Загружаем сферы деятельности…</p>
              )}
              {filters.result.state === 'error' && (
                <div role="alert">
                  <p>Не удалось загрузить сферы деятельности.</p>
                  <Button type="button" variant="secondary" onClick={filters.reload}>
                    Повторить загрузку сфер
                  </Button>
                </div>
              )}
              <label>
                Занятость
                <Select
                  label="Занятость подписки"
                  name="schedule"
                  defaultValue={params.get('schedule') ?? ''}
                  disabled={busy || uncertain || data.items.length >= 5}
                >
                  <option value="">Любая занятость</option>
                  {Object.entries(scheduleLabels).map(([v, label]) => (
                    <option key={v} value={v}>
                      {label}
                    </option>
                  ))}
                </Select>
              </label>
              <label>
                Зарплата от, ₽
                <Input
                  aria-label="Зарплата от, ₽"
                  name="salary"
                  inputMode="numeric"
                  defaultValue={params.get('salary_from') ?? ''}
                />
              </label>
              <label className="subscription-check">
                <Switch
                  name="student"
                  aria-label="Только для студентов"
                  defaultChecked={params.get('student_friendly') === 'true'}
                />{' '}
                Только для студентов
              </label>
              {validation && <p role="alert">{validation}</p>}
              <Button
                className="primary-button"
                type="submit"
                disabled={
                  busy || data.items.length >= 5 || uncertain || filters.result.state !== 'ready'
                }
              >
                Сохранить подписку
              </Button>
            </fieldset>
            {data.items.length >= 5 && (
              <p>Вы сохранили 5 подписок. Удалите ненужную, чтобы создать новую.</p>
            )}
          </form>
          <h2>Мои подписки ({data.items.length}/5)</h2>
          {!data.items.length && <p>Подписок пока нет. Настройте первую выше.</p>}
          <div className="job-list">
            {data.items.map((s) => (
              <article className="job-list-item subscription-card" key={s.id}>
                <h3>
                  {s.region?.name ?? 'Вся Россия'} · {s.category ?? 'Любая сфера'}
                </h3>
                <p>
                  {s.schedule ? scheduleLabels[s.schedule] : 'Любая занятость'}
                  {s.salaryFrom !== null ? ` · от ${s.salaryFrom.toLocaleString('ru-RU')} ₽` : ''}
                  {s.studentOnly ? ' · Для студентов' : ''}
                </p>
                {deleting === s.id ? (
                  <div className="subscription-delete-confirmation">
                    <p>Удалить эту подписку?</p>
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void mutate(() => subscriptions!.remove(s.id), 'Подписка удалена.')
                      }
                    >
                      Подтвердить удаление
                    </Button>{' '}
                    <Button variant="secondary" disabled={busy} onClick={() => setDeleting(null)}>
                      Отмена
                    </Button>
                  </div>
                ) : (
                  <Button
                    className="subscription-delete"
                    variant="ghost"
                    aria-label={`Удалить подписку: ${s.region?.name ?? 'Вся Россия'} · ${s.category ?? 'Любая сфера'}`}
                    disabled={busy}
                    onClick={() => setDeleting(s.id)}
                  >
                    <Trash2 size={20} aria-hidden="true" />
                  </Button>
                )}
              </article>
            ))}
          </div>
        </>
      )}
    </>
  )
}
