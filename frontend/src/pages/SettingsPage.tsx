import { useState } from 'react'
import { Button } from '@maxhub/max-ui'
import { Input } from '../shared/ui/Input'
import { ProfileIdentity } from '../shared/ui/ProfileIdentity'
import { Toast } from '../shared/ui/Toast'
import { useResource, useInvalidateResources } from '../shared/api/useResource'
import { useRefreshOnReturn } from '../shared/api/useRefreshOnReturn'
import { CandidateError, Loading } from '../features/candidate/ui'
import { fieldError } from '../shared/api/fieldError'
import { Check, Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from '../features/appearance/context'
import { useSession } from '../features/session/context'
import { EmployerTrustProgress } from '../features/trust/EmployerTrust'
const options = [
  { value: 'system', title: 'Как на устройстве', icon: Monitor },
  { value: 'light', title: 'Светлая', icon: Sun },
  { value: 'dark', title: 'Тёмная', icon: Moon },
] as const
export function SettingsPage() {
  const { candidate, mode } = useSession()
  const profile = useResource(candidate.profile, 'account:profile')
  useRefreshOnReturn(profile.refresh)
  const [notice, setNotice] = useState('')
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">КАБИНЕТ РАБОТОДАТЕЛЯ</div>
          <h1>Профиль</h1>
        </div>
      </div>
      <section className="settings-panel">
        <h2>Аккаунт</h2>
        <ProfileIdentity />
        <p>
          {mode === 'preview'
            ? 'Демонстрационный профиль'
            : 'Профиль подтверждён при входе через MAX'}
        </p>
      </section>
      {profile.result.state === 'loading' && <Loading />}
      {profile.result.state === 'error' && (
        <CandidateError error={profile.result.error} retry={profile.reload} />
      )}
      {profile.result.state === 'ready' && (
        <CompanyEditor
          key={profile.result.data.companyName ?? ''}
          initial={profile.result.data.companyName ?? ''}
          onSaved={() => {
            profile.refresh()
            setNotice('Сохранено')
          }}
        />
      )}
      <EmployerTrustProgress />
      <AppearanceSettings />
      {notice && <Toast message={notice} onClose={() => setNotice('')} />}
    </>
  )
}

function CompanyEditor({ initial, onSaved }: { initial: string; onSaved: () => void }) {
  const { candidate } = useSession()
  const invalidate = useInvalidateResources()
  const [name, setName] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>()
  return (
    <form
      className="settings-panel company-form"
      data-refresh-lock={busy || name !== initial}
      onSubmit={async (e) => {
        e.preventDefault()
        if (busy || !candidate.saveCompany) return
        setBusy(true)
        setError(undefined)
        try {
          const actual = await candidate.saveCompany(name)
          invalidate()
          setName(actual.companyName ?? '')
          onSaved()
        } catch (e) {
          setError(e)
        } finally {
          setBusy(false)
        }
      }}
    >
      <h2>Название компании</h2>
      <label htmlFor="company-name" className="sr-only">
        Название компании
      </label>
      <Input
        id="company-name"
        value={name}
        maxLength={120}
        disabled={busy}
        placeholder="Например, Кафе «Чайка»"
        onChange={(e) => setName(e.target.value)}
        aria-invalid={!!fieldError(error, 'company_name')}
      />
      <small className="field-hint">
        Показывается в вакансиях вместо вашего имени. Пустое поле — имя из MAX.
      </small>
      {fieldError(error, 'company_name') ? (
        <p role="alert" className="field-error">
          {fieldError(error, 'company_name')}
        </p>
      ) : error ? (
        <CandidateError error={error} />
      ) : null}
      <Button className="primary-button" type="submit" disabled={busy || !candidate.saveCompany}>
        {busy ? 'Сохраняем…' : 'Сохранить'}
      </Button>
    </form>
  )
}

export function AppearanceSettings() {
  const { preference, setPreference } = useTheme()
  return (
    <section className="settings-panel">
      <h2>Оформление</h2>
      <p>В режиме «Как на устройстве» тема меняется вместе с системными настройками.</p>
      <fieldset className="theme-options">
        <legend className="sr-only">Тема оформления</legend>
        {options.map(({ value, title, icon: Icon }) => (
          <label key={value} className={`theme-option ${preference === value ? 'selected' : ''}`}>
            <input
              type="radio"
              name="theme"
              value={value}
              checked={preference === value}
              onChange={() => setPreference(value)}
            />
            <span className={`theme-preview ${value}`}>
              <span />
              <span />
              <span />
            </span>
            <span className="theme-option-label">
              <Icon size={17} />
              {title}
              {preference === value && <Check size={17} className="theme-check" />}
            </span>
          </label>
        ))}
      </fieldset>
    </section>
  )
}
