import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useBeforeUnload, useBlocker, useParams, useLocation } from 'react-router-dom'
import { Button } from '@maxhub/max-ui'
import { ArrowUpRight, CheckCircle2, Copy, Pencil, Send } from 'lucide-react'
import { useSession } from '../features/session/context'
import { SalaryBenchmark } from '../features/benchmark/SalaryBenchmark'
import { VacancyPoster } from '../features/poster/VacancyPoster'
import { Toast } from '../shared/ui/Toast'
import { Modal } from '../shared/ui/Modal'
import { displayDate } from '../shared/format'
import { loadVacancyHiringSummary } from '../features/overview/loadSummary'
import { cardTextLength } from '../features/vacancies/model'
import {
  VacancyFailure,
  VacancyLoading,
  VacancyPreview,
  VacancyStatusBadge,
} from '../features/vacancies/VacancyUi'
import { useResource, useInvalidateResources } from '../shared/api/useResource'
import { config } from '../shared/config'
import { ConfirmDialog } from '../shared/ui/ConfirmDialog'
import { NotFoundPage } from './NotFoundPage'

export function VacancyPage() {
  const { id: routeId } = useParams()
  const id = Number(routeId)
  if (!routeId || !/^\d+$/.test(routeId) || !Number.isSafeInteger(id) || id < 1)
    return <NotFoundPage />
  // Key the controller so an old request can never update another vacancy after navigation.
  return <VacancyDetails key={routeId} id={id} />
}
function VacancyDetails({ id }: { id: number }) {
  const { vacancies, applications, mode } = useSession()
  const invalidate = useInvalidateResources()
  const load = useCallback((signal: AbortSignal) => vacancies.get(id, signal), [id, vacancies])
  const { result, reload, replace } = useResource(load, `employer:vacancy:${id}`)
  const [confirm, setConfirm] = useState<'publish' | 'resend' | 'close' | null>(null)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<unknown>()
  const [needsRefresh, setNeedsRefresh] = useState(false)
  const [checkedChat, setCheckedChat] = useState(false)
  const location = useLocation()
  const [notice, setNotice] = useState(location.state?.saved ? 'Сохранено' : '')
  const [posterOpen, setPosterOpen] = useState(false)
  const loadStats = useCallback(
    (signal: AbortSignal) => loadVacancyHiringSummary(applications, id, signal),
    [applications, id],
  )
  const stats = useResource(loadStats, `employer:vacancy-stats:${id}`)
  const lock = useRef(false),
    mounted = useRef(true)
  const blocker = useBlocker(() => lock.current)
  useBeforeUnload(
    useCallback(
      (event) => {
        if (busy) {
          event.preventDefault()
          event.returnValue = ''
        }
      },
      [busy],
    ),
  )
  useEffect(() => {
    if (!busy && blocker.state === 'blocked') blocker.reset()
  }, [busy, blocker])
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  async function refresh() {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setCheckedChat(false)
    setNotice('')
    setFailure(undefined)
    try {
      const current = await vacancies.get(id)
      if (mounted.current) {
        replace(current)
        setNeedsRefresh(false)
      }
    } catch (error) {
      if (mounted.current) {
        setFailure(error)
        setNeedsRefresh(true)
      }
    } finally {
      lock.current = false
      if (mounted.current) setBusy(false)
    }
  }
  async function mutate(action: 'publish' | 'resend' | 'close') {
    if (lock.current || needsRefresh || (action === 'resend' && !checkedChat)) return
    lock.current = true
    setBusy(true)
    setCheckedChat(false)
    setNotice('')
    setFailure(undefined)
    let attemptedWrite = false
    try {
      if (action === 'resend') {
        const current = await vacancies.get(id)
        if (!mounted.current) return
        replace(current)
        if (
          current.status !== 'published' ||
          current.cardMessageId ||
          cardTextLength(current) > 4000
        ) {
          setConfirm(null)
          setNotice(
            current.cardMessageId && current.status === 'published'
              ? 'Отправка карточки уже подтверждена. Повторная отправка не понадобилась.'
              : 'Состояние вакансии изменилось или карточка слишком длинная. Повторная отправка отменена; проверьте актуальные данные.',
          )
          return
        }
      }
      attemptedWrite = true
      const updated = await vacancies[action === 'resend' ? 'publish' : action](id)
      invalidate()
      if (mounted.current) {
        replace(updated)
        setNotice(
          action === 'close'
            ? 'Вакансия закрыта'
            : mode === 'preview'
              ? 'Демо-публикация сохранена'
              : 'Карточка отправлена в MAX',
        )
        setConfirm(null)
      }
    } catch (error) {
      if (!mounted.current) return
      setConfirm(null)
      setFailure(error)
      setNeedsRefresh(true)
      // In particular, 409 and lost responses require reconciliation before another POST.
      if (!attemptedWrite) return
      try {
        const current = await vacancies.get(id)
        if (mounted.current) {
          replace(current)
          setNeedsRefresh(false)
          if (action !== 'close' && current.status === 'published' && current.cardMessageId) {
            setFailure(undefined)
            setNotice('Проверка подтвердила отправку карточки. Повторная отправка не требуется.')
          }
        }
      } catch {
        /* Keep actions locked until a successful explicit refresh. */
      }
    } finally {
      lock.current = false
      if (mounted.current) setBusy(false)
    }
  }
  if (result.state === 'loading') return <VacancyLoading />
  if (result.state === 'error') return <VacancyFailure error={result.error} retry={reload} />
  const vacancy = result.data
  const tooLong = cardTextLength(vacancy) > 4000
  return (
    <>
      <div className="page-heading vacancies-heading">
        <div>
          <div className="eyebrow">КАБИНЕТ РАБОТОДАТЕЛЯ</div>
          <h1>{vacancy.status === 'draft' ? 'Всё выглядит верно?' : 'Детали вакансии'}</h1>
          <p>
            Вакансия № {vacancy.id} · Создана {displayDate(vacancy.createdAt)}
          </p>
        </div>
        {mode === 'max' && vacancy.status === 'published' && !vacancy.cardMessageId ? (
          <span className="vacancy-status draft">Карточка не подтверждена</span>
        ) : (
          <VacancyStatusBadge status={vacancy.status} />
        )}
      </div>
      {Boolean(failure) && <VacancyFailure error={failure} />}
      {notice && <Toast message={notice} onClose={() => setNotice('')} />}
      {posterOpen && (
        <Modal title="QR-плакат" onClose={() => setPosterOpen(false)}>
          <VacancyPoster key={vacancy.id} id={vacancy.id} />
        </Modal>
      )}
      <div className="vacancy-detail-layout">
        <div className="vacancy-detail-main">
          <VacancyPreview vacancy={vacancy} />
          {vacancy.contactInfo && (
            <section className="surface-panel">
              <h2>Ваш контакт для кандидатов</h2>
              <p>{vacancy.contactInfo}</p>
              <small>Откроется после приглашения кандидата.</small>
            </section>
          )}
        </div>
        <aside className="vacancy-side-panel" aria-busy={busy}>
          {vacancy.status === 'published' && (
            <>
              {vacancy.applyUrl && (
                <Button
                  variant="secondary"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(vacancy.applyUrl!)
                      setNotice('Ссылка скопирована')
                    } catch {
                      setNotice('Не удалось скопировать ссылку')
                    }
                  }}
                >
                  <Copy size={18} />
                  Скопировать ссылку для MAX
                </Button>
              )}
              <Button variant="secondary" onClick={() => setPosterOpen(true)}>
                QR-плакат
              </Button>
            </>
          )}
          <Button asChild variant="secondary">
            <Link to={`/applications?vacancy=${id}`}>
              Отклики · {stats.result.state === 'ready' ? stats.result.data.total : '—'}
            </Link>
          </Button>
          {vacancy.status === 'draft' && (
            <>
              {tooLong && (
                <div className="vacancy-notice is-error" role="alert">
                  <p>
                    Карточка слишком длинная для MAX. Сократите описание: вместе с заголовком и
                    условиями она должна занимать до 4 000 символов.
                  </p>
                </div>
              )}
              <Button
                className="primary-button"
                disabled={busy || needsRefresh || tooLong}
                onClick={() => setConfirm('publish')}
              >
                <Send size={17} />
                Опубликовать
              </Button>
              <Button asChild variant="secondary">
                <Link to={`/vacancies/${id}/edit`}>
                  <Pencil size={16} />
                  Редактировать
                </Link>
              </Button>
            </>
          )}
          {vacancy.status === 'published' && (
            <>
              {!vacancy.cardMessageId && mode === 'max' && (
                <div className="publication-recovery">
                  <h2>Отправка не подтверждена</h2>
                  <p>
                    Сначала проверьте чат с ботом. Если карточка уже там, повторно отправлять её не
                    нужно.
                  </p>
                  <Button variant="secondary" disabled={busy} onClick={() => void refresh()}>
                    {busy ? 'Проверяем…' : 'Проверить состояние'}
                  </Button>
                  <label className="publication-check">
                    <input
                      type="checkbox"
                      checked={checkedChat}
                      disabled={busy || needsRefresh}
                      onChange={(event) => setCheckedChat(event.target.checked)}
                    />
                    <span>Я проверил чат с ботом — карточки нет</span>
                  </label>
                  <Button
                    variant="secondary"
                    disabled={busy || needsRefresh || !checkedChat || tooLong}
                    onClick={() => setConfirm('resend')}
                  >
                    Повторить отправку
                  </Button>
                  {tooLong && (
                    <p role="status">
                      Карточка длиннее 4 000 символов. Создайте исправленную копию вакансии.
                    </p>
                  )}
                </div>
              )}
              <p>
                Для новых условий создайте новую вакансию. Опубликованную карточку изменить нельзя.
              </p>
            </>
          )}
          {vacancy.status === 'closed' && (
            <>
              <span className="step-icon">
                <CheckCircle2 size={25} />
              </span>
              <h2>Поиск завершён</h2>
              <p>
                Новые отклики на эту вакансию больше не принимаются. Открыть её повторно нельзя; при
                необходимости создайте новую.
              </p>
              <Button asChild className="primary-button">
                <Link to="/vacancies/new">Создать новую вакансию</Link>
              </Button>
            </>
          )}
          {busy || needsRefresh ? (
            <Button variant="secondary" disabled>
              Создать копию
            </Button>
          ) : (
            <Button asChild variant="secondary">
              <Link to={`/vacancies/${id}/copy`}>
                <Copy size={16} />
                Создать копию
              </Link>
            </Button>
          )}
          {config.botUrl && mode === 'max' && (
            <a
              className="text-action"
              href={config.botUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Открыть бота в MAX
              <ArrowUpRight size={16} />
            </a>
          )}
          {vacancy.status !== 'closed' && (
            <Button
              variant="secondary"
              className="close-vacancy"
              type="button"
              disabled={busy || needsRefresh}
              onClick={() => setConfirm('close')}
            >
              Закрыть вакансию
            </Button>
          )}
          {needsRefresh && (
            <p role="status">
              Перед следующим действием обновите данные: результат предыдущего запроса пока
              неизвестен.
            </p>
          )}
          {(Boolean(failure) || needsRefresh) &&
            !(vacancy.status === 'published' && !vacancy.cardMessageId) && (
              <Button variant="secondary" disabled={busy} onClick={() => void refresh()}>
                {busy ? 'Проверяем…' : 'Проверить состояние'}
              </Button>
            )}
          {blocker.state === 'blocked' && (
            <p role="status">Дождитесь завершения запроса перед выходом.</p>
          )}
          <SalaryBenchmark position={vacancy.title} region={vacancy.regionCode ?? ''} />
        </aside>
      </div>
      {vacancy.status === 'published' && (
        <Link className="text-link" to={`/team?vacancy=${vacancy.id}`}>
          Пригласить мою команду →
        </Link>
      )}
      {confirm && (
        <ConfirmDialog
          title={
            confirm === 'resend'
              ? 'Повторить отправку карточки?'
              : confirm === 'publish'
                ? 'Опубликовать вакансию?'
                : 'Закрыть вакансию?'
          }
          confirm={
            confirm === 'resend'
              ? 'Отправить повторно'
              : confirm === 'publish'
                ? 'Подтвердить публикацию'
                : 'Да, закрыть'
          }
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={() => void mutate(confirm)}
        >
          <p>
            {confirm === 'resend'
              ? 'Вы подтвердили, что карточки нет в чате. Бот попробует отправить её снова для этой же вакансии. Если первая отправка всё же дошла, в чате может появиться дубль.'
              : confirm === 'publish'
                ? mode === 'preview'
                  ? 'Демо изменит статус только в этом браузере. Карточка в MAX не отправится.'
                  : 'Бот отправит карточку с описанием в ваш чат. Редактирование станет недоступно.'
                : 'Новые отклики больше не будут приниматься. Это действие нельзя отменить; сама вакансия останется в списке.'}
          </p>
        </ConfirmDialog>
      )}
    </>
  )
}
