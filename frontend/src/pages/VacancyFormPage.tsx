import { Input } from '../shared/ui/Input'
import { Select } from '../shared/ui/Select'
import { RegionSelect } from '../shared/ui/RegionSelect'
import { CategoryInput } from '../features/categories/CategoryInput'
import { fieldError } from '../shared/api/fieldError'
import { BadgePicker } from '../features/badges/BadgePicker'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useBeforeUnload, useBlocker, useNavigate, useParams } from 'react-router-dom'
import { Button, Textarea } from '@maxhub/max-ui'
import { ArrowRight } from 'lucide-react'
import type { Vacancy } from '../entities/hiring'
import { useSession } from '../features/session/context'
import { SalaryBenchmark } from '../features/benchmark/SalaryBenchmark'
import {
  fieldLabels,
  formValues,
  scheduleLabels,
  validateForm,
  type FieldErrors,
  type VacancyForm,
} from '../features/vacancies/model'
import { VacancyFailure, VacancyLoading } from '../features/vacancies/VacancyUi'
import { ApiError } from '../shared/api/client'
import { useResource } from '../shared/api/useResource'
import { ConfirmDialog } from '../shared/ui/ConfirmDialog'
import { NotFoundPage } from './NotFoundPage'

export function VacancyFormPage({ copy = false }: { copy?: boolean }) {
  const { id } = useParams()
  if (id && (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) < 1))
    return <NotFoundPage />
  return id ? <ExistingVacancy id={Number(id)} copy={copy} /> : <VacancyEditor key="new" />
}
function ExistingVacancy({ id, copy }: { id: number; copy: boolean }) {
  const { vacancies } = useSession()
  const load = useCallback((signal: AbortSignal) => vacancies.get(id, signal), [id, vacancies])
  const { result, reload } = useResource(load, String(id))
  if (result.state === 'loading') return <VacancyLoading />
  if (result.state === 'error') return <VacancyFailure error={result.error} retry={reload} />
  if (!copy && result.data.status !== 'draft')
    return (
      <section className="vacancy-empty">
        <h1>Редактирование недоступно</h1>
        <p>Изменять можно только черновики. Эта вакансия уже опубликована или закрыта.</p>
        <Link className="text-action" to={`/vacancies/${id}`}>
          Открыть вакансию
        </Link>
      </section>
    )
  return copy ? (
    <VacancyEditor key={`copy-${id}`} source={result.data} />
  ) : (
    <VacancyEditor key={`edit-${id}`} vacancy={result.data} />
  )
}
function VacancyEditor({ vacancy, source }: { vacancy?: Vacancy; source?: Vacancy }) {
  const { vacancies } = useSession()
  const navigate = useNavigate()
  const returnId = vacancy?.id ?? source?.id
  // Copy only editable fields; identity, publication and applications belong to the source.
  const [initial] = useState(() => formValues(vacancy ?? source))
  const [values, setValues] = useState(initial)
  const [badgeLimit, setBadgeLimit] = useState(10)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [failure, setFailure] = useState<unknown>()
  const [uncertain, setUncertain] = useState(false)
  const [busy, setBusy] = useState(false)
  const lock = useRef(false),
    saved = useRef(false),
    mounted = useRef(true)
  const form = useRef<HTMLFormElement>(null)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const dirty = Boolean(source) || JSON.stringify(initial) !== JSON.stringify(values)
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      !saved.current &&
      (dirty || lock.current) &&
      currentLocation.pathname !== nextLocation.pathname,
  )
  useBeforeUnload(
    useCallback(
      (event) => {
        if ((dirty || busy) && !saved.current) {
          event.preventDefault()
          event.returnValue = ''
        }
      },
      [dirty, busy],
    ),
  )

  function change(key: keyof VacancyForm, value: string) {
    setValues((previous) => ({ ...previous, [key]: value }))
    setErrors((previous) => ({ ...previous, [key]: undefined }))
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (lock.current || uncertain) return
    const checked = validateForm(values, badgeLimit)
    setErrors(checked.errors)
    if (Object.keys(checked.errors).length) {
      form.current
        ?.querySelector<HTMLInputElement>(`[name="${Object.keys(checked.errors)[0]}"]`)
        ?.focus()
      return
    }
    lock.current = true
    setBusy(true)
    setFailure(undefined)
    try {
      const result = vacancy
        ? await vacancies.update(vacancy.id, checked.input)
        : await vacancies.create(checked.input)
      if (!mounted.current) return
      saved.current = true
      if (blocker.state === 'blocked') blocker.reset()
      void navigate(`/vacancies/${result.id}`, { replace: true, state: { saved: true } })
    } catch (error) {
      if (!mounted.current) return
      setFailure(error)
      if (error instanceof ApiError) {
        const fields: FieldErrors = {}
        for (const name of error.fields)
          if (name in fieldLabels) fields[name as keyof VacancyForm] = fieldError(error, name)
        setErrors(fields)
        // A lost response cannot prove a create failed. Require checking the list before resubmitting.
        setUncertain(
          error.kind === 'network' ||
            error.kind === 'contract' ||
            error.status >= 500 ||
            error.status === 409,
        )
      } else setUncertain(true)
    } finally {
      lock.current = false
      if (mounted.current) setBusy(false)
    }
  }
  function field(
    key: keyof VacancyForm,
    options: {
      hint?: string
      limit?: number
      multiline?: boolean
      placeholder?: string
      numeric?: boolean
    } = {},
  ) {
    const props = {
      id: `vacancy-${key}`,
      name: key,
      value: values[key],
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        change(key, event.target.value),
      maxLength: options.limit,
      placeholder: options.placeholder,
      'aria-invalid': Boolean(errors[key]),
      'aria-describedby': `help-${key}`,
      required: key === 'title',
    }
    return (
      <div className="vacancy-field">
        <label htmlFor={props.id}>
          {fieldLabels[key]}
          {key === 'title' && <span aria-hidden="true"> *</span>}
        </label>
        {options.multiline ? (
          <Textarea {...props} rows={7} />
        ) : (
          <Input {...props} type="text" inputMode={options.numeric ? 'numeric' : undefined} />
        )}
        <div id={`help-${key}`} className={errors[key] ? 'field-error' : 'field-hint'}>
          {errors[key] ?? options.hint}
          {options.multiline && (
            <span className="field-counter">
              {values[key].length} / {options.limit}
            </span>
          )}
        </div>
      </div>
    )
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">КАБИНЕТ РАБОТОДАТЕЛЯ</div>
          <h1>
            {vacancy ? 'Редактировать черновик' : source ? 'Копия вакансии' : 'Новая вакансия'}
          </h1>
          <p>Сначала детали. Публикацию подтвердите на следующем экране.</p>
        </div>
      </div>
      <div className="vacancy-editor-layout">
        <form
          className="vacancy-form"
          onSubmit={(event) => void submit(event)}
          noValidate
          ref={form}
          aria-busy={busy}
        >
          <fieldset disabled={busy}>
            <legend className="sr-only">Данные вакансии</legend>
            <section className="form-section">
              {field('title', { limit: 200, placeholder: 'Например, повар в летнее кафе' })}
              <CategoryInput
                value={values.category}
                onChange={(value) => change('category', value)}
                error={errors.category}
              />
              <RegionSelect
                value={values.region_code}
                onChange={(value) => change('region_code', value)}
              />
              {errors.region_code && (
                <p role="alert" className="field-error">
                  {errors.region_code}
                </p>
              )}
              <div className="vacancy-field">
                <label htmlFor="vacancy-schedule">Тип занятости</label>
                <Select
                  label="Тип занятости"
                  id="vacancy-schedule"
                  name="schedule"
                  value={values.schedule}
                  onChange={(e) => change('schedule', e.target.value)}
                >
                  {Object.entries(scheduleLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
                {errors.schedule && <small className="field-error">{errors.schedule}</small>}
              </div>
              <div className="form-grid">
                {field('salary_min', { numeric: true, placeholder: 'От, ₽' })}
                {field('salary_max', { numeric: true, placeholder: 'До, ₽' })}
              </div>
              {field('headcount', {
                numeric: true,
                placeholder: 'Например, 15',
                hint: 'Пустое поле — без лимита. От 1 до 1000 человек.',
              })}
              {field('description', {
                multiline: true,
                limit: 4000,
                placeholder: 'Задачи, график, период оплаты, требования…',
              })}
              <BadgePicker
                value={values.badges}
                studentFriendly={values.student_friendly === 'yes'}
                error={errors.badges}
                onLimit={setBadgeLimit}
                onChange={(keys, student) => {
                  setValues((previous) => ({
                    ...previous,
                    badges: keys.join(','),
                    student_friendly: student ? 'yes' : '',
                  }))
                  setErrors((previous) => ({ ...previous, badges: undefined }))
                }}
              />
              {field('contact_info', {
                limit: 300,
                placeholder: 'Телефон, @ник, e-mail или ссылка на MAX / Telegram',
                hint: 'Кандидат увидит контакт, когда вы его пригласите. До 3 контактов через запятую.',
              })}
            </section>
          </fieldset>
          {Boolean(failure) && <VacancyFailure error={failure} />}
          {uncertain && (
            <div className="vacancy-notice" role="status">
              <p>
                Сохранение не подтверждено. Проверьте{' '}
                {vacancy ? 'текущее состояние вакансии' : 'список вакансий'}, прежде чем отправлять
                форму снова. Введённый текст остаётся здесь до выхода.
              </p>
              <Link
                className="text-action"
                to={vacancy ? `/vacancies/${vacancy.id}` : '/vacancies'}
              >
                Проверить сохранение
              </Link>
            </div>
          )}
          <div className="form-submit">
            <Button type="submit" className="primary-button" disabled={busy || uncertain}>
              {busy ? 'Сохраняем…' : 'Сохранить и проверить'}
              <ArrowRight size={18} />
            </Button>
            <Link className="text-action" to={returnId ? `/vacancies/${returnId}` : '/vacancies'}>
              Отмена
            </Link>
          </div>
        </form>
        <aside className="vacancy-form-aside">
          <SalaryBenchmark position={values.title} region={values.region_code} />
        </aside>
      </div>
      {blocker.state === 'blocked' && (
        <ConfirmDialog
          title={busy ? 'Идёт сохранение' : 'Выйти из формы?'}
          confirm="Выйти без сохранения"
          busy={busy}
          onCancel={() => blocker.reset()}
          onConfirm={() => blocker.proceed()}
        >
          <p>
            {busy
              ? 'Дождитесь ответа сервиса. Это поможет избежать повторного создания вакансии.'
              : 'Несохранённые изменения будут потеряны.'}
          </p>
        </ConfirmDialog>
      )}
    </>
  )
}
