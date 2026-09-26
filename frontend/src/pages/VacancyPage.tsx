import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button } from '@maxhub/max-ui'
import { ArrowUpRight, CheckCircle2, Pencil, Send } from 'lucide-react'
import { useSession } from '../features/session/context'
import { cardTextLength } from '../features/vacancies/model'
import {
  VacancyFailure,
  VacancyLoading,
  VacancyPreview,
  VacancyStatusBadge,
} from '../features/vacancies/VacancyUi'
import { useResource } from '../shared/api/useResource'
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
  const { vacancies, mode } = useSession()
  const load = useCallback((signal: AbortSignal) => vacancies.get(id, signal), [id, vacancies])
  const { result, reload, replace } = useResource(load, String(id))
  const [confirm, setConfirm] = useState<'publish' | 'close' | null>(null)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<unknown>()
  const [needsRefresh, setNeedsRefresh] = useState(false)
  const lock = useRef(false),
    mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  async function refresh() {
    if (lock.current) return
    setFailure(undefined)
    setNeedsRefresh(false)
    reload()
  }
  async function mutate(action: 'publish' | 'close') {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setFailure(undefined)
    try {
      const updated = await vacancies[action](id)
      if (mounted.current) {
        replace(updated)
        setConfirm(null)
      }
    } catch (error) {
      if (!mounted.current) return
      setConfirm(null)
      setFailure(error)
      setNeedsRefresh(true)
      // In particular, 409 and lost responses require reconciliation before another POST.
      try {
        const current = await vacancies.get(id)
        if (mounted.current) {
          replace(current)
          setNeedsRefresh(false)
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
          <div className="eyebrow">
            {vacancy.status === 'draft' ? 'ШАГ 2 · ПРОВЕРЬТЕ ПЕРЕД ПУБЛИКАЦИЕЙ' : 'ВАША ВАКАНСИЯ'}
          </div>
          <h1>{vacancy.status === 'draft' ? 'Всё выглядит верно?' : 'Детали вакансии'}</h1>
          <p>
            Вакансия № {vacancy.id} · Создана{' '}
            {new Date(vacancy.createdAt).toLocaleDateString('ru-RU')}
          </p>
        </div>
        <VacancyStatusBadge status={vacancy.status} />
      </div>
      {Boolean(failure) && <VacancyFailure error={failure} retry={() => void refresh()} />}
      <div className="vacancy-detail-layout">
        <VacancyPreview vacancy={vacancy} />
        <aside className="vacancy-side-panel" aria-busy={busy}>
          {vacancy.status === 'draft' && (
            <>
              <span className="step-icon">
                <Send size={24} />
              </span>
              <h2>Готовы искать команду?</h2>
              <p>
                Черновик сохранён. После публикации карточка придёт в чат с ботом — её можно
                переслать в нужное сообщество.
              </p>
              <p>
                Сначала начните личный чат с ботом. После публикации изменить вакансию будет нельзя.
              </p>
              {tooLong && (
                <div className="vacancy-notice is-error" role="alert">
                  <p>
                    Карточка слишком длинная для MAX. Сократите описание: вместе с заголовком и
                    контактами она должна занимать до 4 000 символов.
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
              <small>
                Здесь показано содержание вакансии. Оформление сообщения в MAX может отличаться.
              </small>
            </>
          )}
          {vacancy.status === 'published' && (
            <>
              <span className="step-icon">
                <CheckCircle2 size={25} />
              </span>
              <h2>
                {mode === 'preview'
                  ? 'Демо-публикация готова'
                  : vacancy.cardMessageId
                    ? 'Вакансия опубликована'
                    : 'Проверяем карточку'}
              </h2>
              <p>
                {mode === 'preview'
                  ? 'Это локальный пример. Сообщения в MAX не отправлялись.'
                  : vacancy.cardMessageId
                    ? 'Карточка отправлена в чат с ботом. Откройте MAX и перешлите её в нужные чаты.'
                    : 'Сервис сохранил статус публикации, но не вернул подтверждение карточки. Проверьте чат с ботом и обновите данные.'}
              </p>
              {!vacancy.cardMessageId && (
                <Button variant="secondary" onClick={() => void refresh()}>
                  Обновить данные
                </Button>
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
            <button
              className="close-vacancy"
              type="button"
              disabled={busy || needsRefresh}
              onClick={() => setConfirm('close')}
            >
              Закрыть вакансию
            </button>
          )}
          {needsRefresh && (
            <p role="status">
              Перед следующим действием обновите данные: результат предыдущего запроса пока
              неизвестен.
            </p>
          )}
        </aside>
      </div>
      {confirm && (
        <ConfirmDialog
          title={confirm === 'publish' ? 'Опубликовать вакансию?' : 'Закрыть вакансию?'}
          confirm={confirm === 'publish' ? 'Подтвердить публикацию' : 'Да, закрыть'}
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={() => void mutate(confirm)}
        >
          <p>
            {confirm === 'publish'
              ? mode === 'preview'
                ? 'Демо изменит статус только в этом браузере. Карточка в MAX не отправится.'
                : 'Бот отправит карточку с описанием и контактами в ваш чат. Редактирование станет недоступно.'
              : 'Новые отклики больше не будут приниматься. Это действие нельзя отменить; сама вакансия останется в списке.'}
          </p>
        </ConfirmDialog>
      )}
    </>
  )
}
