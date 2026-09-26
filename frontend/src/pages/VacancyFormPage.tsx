import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useBeforeUnload, useBlocker, useNavigate, useParams } from 'react-router-dom'
import { Button } from '@maxhub/max-ui'
import { ArrowRight, Check, FilePenLine, Send } from 'lucide-react'
import type { Vacancy } from '../entities/hiring'
import { useSession } from '../features/session/context'
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

export function VacancyFormPage() {
  const { id } = useParams()
  if (id && (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) < 1))
    return <NotFoundPage />
  return id ? <EditVacancy id={Number(id)} /> : <VacancyEditor key="new" />
}
function EditVacancy({ id }: { id: number }) {
  const { vacancies } = useSession()
  const load = useCallback((signal: AbortSignal) => vacancies.get(id, signal), [id, vacancies])
  const { result, reload } = useResource(load, String(id))
  if (result.state === 'loading') return <VacancyLoading />
  if (result.state === 'error') return <VacancyFailure error={result.error} retry={reload} />
  if (result.data.status !== 'draft')
    return (
      <section className="vacancy-empty">
        <h1>Редактирование недоступно</h1>
        <p>Изменять можно только черновики. Эта вакансия уже опубликована или закрыта.</p>
        <Link className="text-action" to={`/vacancies/${id}`}>
          Открыть вакансию
        </Link>
      </section>
    )
  return <VacancyEditor key={id} vacancy={result.data} />
}
function VacancyEditor({ vacancy }: { vacancy?: Vacancy }) {
  const { vacancies } = useSession()
  const navigate = useNavigate()
  const [initial] = useState(() => formValues(vacancy))
  const [values, setValues] = useState(initial)
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
  const dirty = JSON.stringify(initial) !== JSON.stringify(values)
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
    const checked = validateForm(values)
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
          if (name in fieldLabels)
            fields[name as keyof VacancyForm] = 'Проверьте значение этого поля.'
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
          <textarea {...props} rows={7} />
        ) : (
          <input {...props} type="text" inputMode={options.numeric ? 'numeric' : undefined} />
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
          <div className="eyebrow">ШАГ 1 · РАССКАЖИТЕ О РАБОТЕ</div>
          <h1>{vacancy ? 'Редактировать черновик' : 'Новая вакансия'}</h1>
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
              <h2>
                <span>01</span>Кого ищем
              </h2>
              {field('title', {
                limit: 200,
                placeholder: 'Например, повар в летнее кафе',
                hint: 'Обязательное поле. Понятное название поможет быстрее найти сотрудника.',
              })}
              <div className="form-grid">
                {field('region_code', {
                  limit: 100,
                  placeholder: 'Город или область',
                  hint: 'Где предстоит работать.',
                })}
                {field('category', {
                  limit: 100,
                  placeholder: 'Например, общепит',
                  hint: 'Необязательно.',
                })}
              </div>
              <div className="vacancy-field">
                <label htmlFor="vacancy-schedule">Тип занятости</label>
                <select
                  id="vacancy-schedule"
                  name="schedule"
                  value={values.schedule}
                  onChange={(event) => change('schedule', event.target.value)}
                >
                  {Object.entries(scheduleLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                {errors.schedule && <span className="field-error">{errors.schedule}</span>}
              </div>
            </section>
            <section className="form-section">
              <h2>
                <span>02</span>Условия работы
              </h2>
              <div className="form-grid">
                {field('salary_min', {
                  numeric: true,
                  placeholder: 'Например, 50 000',
                  hint: 'Рубли, без копеек.',
                })}
                {field('salary_max', {
                  numeric: true,
                  placeholder: 'Например, 70 000',
                  hint: 'Можно указать только одну границу.',
                })}
              </div>
              <p className="form-note">
                Если сумма пока не определена, оставьте оба поля пустыми. Период оплаты — за час,
                смену или месяц — укажите в описании.
              </p>
              {field('description', {
                multiline: true,
                limit: 4000,
                placeholder: 'Задачи, график, период оплаты, требования и что вы предлагаете…',
                hint: 'Будущему сотруднику важно представить свой рабочий день.',
              })}
            </section>
            <section className="form-section">
              <h2>
                <span>03</span>Как с вами связаться
              </h2>
              {field('contact_info', {
                limit: 300,
                placeholder: 'Имя, телефон или контакт в MAX',
                hint: 'Этот контакт будет виден всем, кому отправят карточку вакансии.',
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
            <Link className="text-action" to={vacancy ? `/vacancies/${vacancy.id}` : '/vacancies'}>
              Отмена
            </Link>
          </div>
        </form>
        <aside className="vacancy-form-aside">
          <div className="eyebrow">ОТ ИДЕИ ДО ПУБЛИКАЦИИ</div>
          <ol className="vacancy-progress">
            <li className="current">
              <FilePenLine size={18} />
              <div>
                <strong>Заполните детали</strong>
                <p>Что за работа и кого вы ждёте.</p>
              </div>
            </li>
            <li>
              <Check size={18} />
              <div>
                <strong>Проверьте черновик</strong>
                <p>Можно вернуться и всё поправить.</p>
              </div>
            </li>
            <li>
              <Send size={18} />
              <div>
                <strong>Опубликуйте в MAX</strong>
                <p>Карточка придёт в чат с ботом.</p>
              </div>
            </li>
          </ol>
          <p>Коротко и по делу: конкретные задачи, понятная оплата и удобный способ связи.</p>
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
