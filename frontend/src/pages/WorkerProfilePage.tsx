import { useRef, useState, type FormEvent } from 'react'
import { Button } from '@maxhub/max-ui'
import { useSession } from '../features/session/context'
import { useCabinet } from '../features/cabinet/context'
import type { Profile } from '../features/candidate/api'
import { BotChatNote, CandidateError, Loading } from '../features/candidate/ui'
import { useResource } from '../shared/api/useResource'
import { AppearanceSettings } from './SettingsPage'

function ProfileForm({ profile }: { profile: Profile }) {
  const { candidate } = useSession()
  const [contact, setContact] = useState(profile.applicationContact ?? '')
  const [saved, setSaved] = useState(profile.applicationContact ?? '')
  const [busy, setBusy] = useState(false),
    lock = useRef(false)
  const [error, setError] = useState<unknown>(),
    [message, setMessage] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (lock.current) return
    if (contact.trim().length > 200) {
      setMessage('Контакт должен быть не длиннее 200 символов.')
      return
    }
    lock.current = true
    setBusy(true)
    setError(undefined)
    setMessage('')
    try {
      const result = await candidate.saveContact(contact.trim() || null)
      setContact(result.applicationContact ?? '')
      setSaved(result.applicationContact ?? '')
      setMessage(result.applicationContact ? 'Контакт сохранён.' : 'Сохранённый контакт удалён.')
    } catch (e) {
      setError(e)
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  return (
    <form
      className="settings-panel candidate-profile-form"
      onSubmit={(event) => void submit(event)}
    >
      <h2>Контакт для откликов</h2>
      <p>
        Подставим его в форму. Перед каждым откликом вы сможете проверить и изменить контакт. Уже
        отправленные отклики останутся без изменений.
      </p>
      <label className="candidate-input">
        Телефон или контакт в MAX
        <input
          maxLength={200}
          value={contact}
          disabled={busy}
          onChange={(event) => {
            setContact(event.target.value)
            setMessage('')
          }}
          placeholder="+7 …, @имя или ссылка MAX"
        />
      </label>
      <p>Чтобы удалить сохранённый контакт, очистите поле и сохраните.</p>
      {error !== undefined && <CandidateError error={error} />}
      <div className="vacancy-actions">
        <Button
          type="submit"
          className="primary-button"
          disabled={busy || contact.trim() === saved}
        >
          {busy ? 'Сохраняем…' : 'Сохранить контакт'}
        </Button>
        <p role="status">{message}</p>
      </div>
    </form>
  )
}

export function WorkerProfilePage() {
  const { candidate, user } = useSession(),
    { switchCabinet } = useCabinet()
  const resource = useResource(candidate.profile, 'worker-profile'),
    { result } = resource
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">КАБИНЕТ РАБОТНИКА</span>
          <h1>Мой профиль</h1>
          <p>Ваш контакт для откликов и настройки приложения.</p>
        </div>
      </div>
      {result.state === 'loading' && <Loading />}
      {result.state === 'error' && <CandidateError error={result.error} retry={resource.reload} />}
      {result.state === 'ready' && (
        <>
          <section className="settings-panel">
            <h2>{result.data.displayName || user.display_name}</h2>
            <p>Аккаунт MAX · № {result.data.id}</p>
            {!result.data.hasBotChat && <BotChatNote />}
            <Button variant="secondary" onClick={resource.reload}>
              Обновить профиль
            </Button>
          </section>
          <ProfileForm
            key={`${result.data.id}:${result.data.applicationContact}`}
            profile={result.data}
          />
        </>
      )}
      <AppearanceSettings />
      <section className="settings-panel">
        <h2>Ищете сотрудников?</h2>
        <p>В кабинете работодателя можно создавать вакансии и управлять наймом.</p>
        <Button variant="secondary" onClick={switchCabinet}>
          Сменить режим
        </Button>
      </section>
    </>
  )
}
