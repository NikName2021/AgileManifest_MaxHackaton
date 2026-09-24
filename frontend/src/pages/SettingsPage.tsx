import { Check, Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from '../features/appearance/context'
import { useSession } from '../features/session/context'
const options = [
  { value: 'system', title: 'Как на устройстве', icon: Monitor },
  { value: 'light', title: 'Светлая', icon: Sun },
  { value: 'dark', title: 'Тёмная', icon: Moon },
] as const
export function SettingsPage() {
  const { preference, setPreference } = useTheme()
  const { user, mode } = useSession()
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">ВАШЕ ПРОСТРАНСТВО</div>
          <h1>Пусть будет удобно</h1>
          <p>Настройте внешний вид под себя.</p>
        </div>
      </div>
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
      <section className="settings-panel account-panel">
        <div>
          <h2>Рабочий профиль</h2>
          <p>
            {mode === 'preview'
              ? 'Демонстрационный профиль для просмотра интерфейса.'
              : 'Профиль подтверждён при входе через MAX.'}
          </p>
        </div>
        <dl>
          <div>
            <dt>Имя</dt>
            <dd>{user.display_name}</dd>
          </div>
          <div>
            <dt>Роль</dt>
            <dd>Работодатель</dd>
          </div>
          <div>
            <dt>Режим</dt>
            <dd>{mode === 'preview' ? 'Локальный просмотр' : 'MAX'}</dd>
          </div>
        </dl>
      </section>
    </>
  )
}
