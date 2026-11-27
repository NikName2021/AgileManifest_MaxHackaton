import { useEffect, useId, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Expand,
  Film,
  Megaphone,
  Moon,
  Search,
  Sun,
  Users,
  X,
} from 'lucide-react'
import './welcome-gallery.css'

const roleIds = ['worker', 'employer', 'partner'] as const
type GalleryRole = (typeof roleIds)[number]
type GalleryTheme = 'dark' | 'light'
type Screen = { src: string; title: string; description: string }

const roles = {
  worker: {
    label: 'Работник',
    icon: Search,
    title: 'Кабинет работника',
    description: 'Найдите подходящую работу, оставьте отклик и следите за ответом работодателя.',
    video: 'Поиск вакансии, отправка отклика и подписка на новые предложения.',
    screens: [
      {
        file: 'search',
        title: 'Поиск работы',
        description: 'Вакансии, фильтры и предложения для студентов.',
      },
      {
        file: 'vacancy',
        title: 'Условия вакансии',
        description: 'Оплата, место работы и обязанности в одной карточке.',
      },
      {
        file: 'applications',
        title: 'Мои отклики',
        description: 'Статусы откликов и договорённости с работодателями.',
      },
      {
        file: 'subscriptions',
        title: 'Подписки',
        description: 'Новые подходящие вакансии — в личном чате с ботом.',
      },
    ],
  },
  employer: {
    label: 'Работодатель',
    icon: Users,
    title: 'Кабинет работодателя',
    description: 'Размещайте вакансии, знакомьтесь с кандидатами и собирайте команду на сезон.',
    video: 'Работа с откликами, назначение смены и команда проверенных сотрудников.',
    screens: [
      {
        file: 'vacancies',
        title: 'Мои вакансии',
        description: 'Публикации, количество откликов и свободные места.',
      },
      {
        file: 'applications',
        title: 'Кандидаты',
        description: 'Все отклики и этапы найма в одном кабинете.',
      },
      {
        file: 'shift',
        title: 'Выход на смену',
        description: 'Дата, инструкция и подтверждение выхода кандидата.',
      },
      {
        file: 'team',
        title: 'Моя команда',
        description: 'Сотрудники, которых можно пригласить снова.',
      },
    ],
  },
  partner: {
    label: 'Партнёр',
    icon: Megaphone,
    title: 'Кабинет партнёра',
    description:
      'Подключите канал вуза или студотряда и настройте автоматическую рассылку вакансий.',
    video: 'Подключение канала, выбор подходящих вакансий и расписание публикаций.',
    screens: [
      {
        file: 'connection',
        title: 'Подключение канала',
        description: 'Как добавить бота и проверить подключение.',
      },
      {
        file: 'channel',
        title: 'Рассылка и статистика',
        description: 'Автопубликация, отклики из канала и результаты найма.',
      },
      {
        file: 'filters',
        title: 'Подбор вакансий',
        description: 'Регион, сферы и условия для аудитории канала.',
      },
      {
        file: 'schedule',
        title: 'Режим публикации',
        description: 'Сразу после появления или одним постом в день.',
      },
    ],
  },
}

function ScreenshotViewer({
  screens,
  theme,
  initialIndex,
  onClose,
}: {
  screens: Screen[]
  theme: GalleryTheme
  initialIndex: number
  onClose: () => void
}) {
  const [index, setIndex] = useState(initialIndex)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const screen = screens[index]

  useEffect(() => {
    const dialog = dialogRef.current!
    const previousFocus = document.activeElement
    const overflow = document.documentElement.style.overflow
    dialog.showModal()
    document.documentElement.style.overflow = 'hidden'
    return () => {
      dialog.close()
      document.documentElement.style.overflow = overflow
      if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true })
    }
  }, [])

  function move(direction: number) {
    setIndex((current) => (current + direction + screens.length) % screens.length)
  }

  return (
    <dialog
      ref={dialogRef}
      className="welcome-gallery-viewer"
      data-gallery-theme={theme}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return
        const bounds = event.currentTarget.getBoundingClientRect()
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          onClose()
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault()
          move(event.key === 'ArrowLeft' ? -1 : 1)
        }
      }}
    >
      <header>
        <div aria-live="polite" aria-atomic="true">
          <span className="welcome-gallery-count">
            {index + 1} / {screens.length}
          </span>
          <h3 id={titleId}>{screen.title}</h3>
        </div>
        <button
          type="button"
          className="welcome-gallery-control"
          onClick={onClose}
          aria-label="Закрыть скриншот"
          autoFocus
        >
          <X size={22} />
        </button>
      </header>
      <div className="welcome-gallery-fullscreen">
        <img
          src={screen.src}
          alt={screen.title + ' — мобильный экран приложения «Сезон»'}
          width={780}
          height={1688}
        />
      </div>
      <footer>
        <button
          type="button"
          className="welcome-gallery-control"
          onClick={() => move(-1)}
          aria-label="Предыдущий скриншот"
        >
          <ArrowLeft size={22} />
        </button>
        <p>{screen.description}</p>
        <button
          type="button"
          className="welcome-gallery-control"
          onClick={() => move(1)}
          aria-label="Следующий скриншот"
        >
          <ArrowRight size={22} />
        </button>
      </footer>
    </dialog>
  )
}

function GalleryVideo({ mediaPath, title }: { mediaPath: string; title: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const video = ref.current!
    return () => {
      if (!video.paused) video.pause()
    }
  }, [])
  return (
    <video
      ref={ref}
      controls
      playsInline
      preload="none"
      poster={`${mediaPath}/poster.jpg`}
      src={`${mediaPath}/demo.mp4`}
      width={1280}
      height={800}
      aria-label={title}
      aria-describedby="demo-description demo-note"
    >
      Ваш браузер не поддерживает видео. <a href={`${mediaPath}/demo.mp4`}>Скачать демо</a>.
    </video>
  )
}

export function WelcomeGallery() {
  const [role, setRole] = useState<GalleryRole>('worker')
  const [theme, setTheme] = useState<GalleryTheme>('dark')
  const [selected, setSelected] = useState<number | null>(null)
  const themeId = useId()
  const content = roles[role]
  const mediaPath = `${import.meta.env.BASE_URL}media/gallery/${role}/${theme}`
  const screens = content.screens.map((screen) => ({
    ...screen,
    src: `${mediaPath}/${screen.file}.png`,
  }))

  function chooseRole(nextRole: GalleryRole) {
    setSelected(null)
    setRole(nextRole)
  }

  return (
    <section
      className="welcome-section welcome-container welcome-gallery"
      aria-labelledby="gallery-title"
    >
      <header className="welcome-section-heading">
        <h2 id="gallery-title">Галерея</h2>
        <p>
          Посмотрите, как устроен «Сезон» для каждой роли. Выберите светлую или тёмную тему —
          скриншоты и видео покажут нужный вариант.
        </p>
      </header>
      <div className="welcome-gallery-toolbar">
        <div className="welcome-gallery-roles" role="tablist" aria-label="Роль в приложении">
          {roleIds.map((value, index) => {
            const Icon = roles[value].icon
            return (
              <button
                key={value}
                type="button"
                role="tab"
                id={`gallery-tab-${value}`}
                aria-selected={role === value}
                aria-controls="gallery-panel"
                tabIndex={role === value ? 0 : -1}
                onClick={() => chooseRole(value)}
                onKeyDown={(event) => {
                  let next: number
                  if (event.key === 'ArrowRight') next = (index + 1) % roleIds.length
                  else if (event.key === 'ArrowLeft')
                    next = (index + roleIds.length - 1) % roleIds.length
                  else if (event.key === 'Home') next = 0
                  else if (event.key === 'End') next = roleIds.length - 1
                  else return
                  event.preventDefault()
                  chooseRole(roleIds[next])
                  const tabs =
                    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                      '[role="tab"]',
                    )
                  tabs?.[next]?.focus()
                }}
              >
                <Icon size={18} aria-hidden="true" />
                {roles[value].label}
              </button>
            )
          })}
        </div>
        <fieldset className="welcome-gallery-themes">
          <legend className="welcome-gallery-sr-only">Тема скриншотов и видео</legend>
          {(['light', 'dark'] as const).map((value) => (
            <label key={value} data-selected={theme === value}>
              <input
                type="radio"
                name={themeId}
                value={value}
                checked={theme === value}
                onChange={() => {
                  setSelected(null)
                  setTheme(value)
                }}
              />
              {value === 'light' ? (
                <Sun size={18} aria-hidden="true" />
              ) : (
                <Moon size={18} aria-hidden="true" />
              )}
              {value === 'light' ? 'Светлая' : 'Тёмная'}
            </label>
          ))}
        </fieldset>
      </div>
      <div
        className="welcome-gallery-panel"
        id="gallery-panel"
        role="tabpanel"
        aria-labelledby={`gallery-tab-${role}`}
        data-gallery-theme={theme}
      >
        <header className="welcome-gallery-role-heading">
          <h3>{content.title}</h3>
          <p>{content.description}</p>
        </header>
        <ul
          key={mediaPath}
          className="welcome-gallery-screens"
          aria-label={`Мобильные экраны: ${content.label}`}
        >
          {screens.map((screen, index) => (
            <li key={screen.src}>
              <button
                type="button"
                onClick={() => setSelected(index)}
                aria-label={'Увеличить: ' + screen.title}
                aria-haspopup="dialog"
              >
                <span className="welcome-gallery-phone">
                  <img
                    src={screen.src}
                    alt={screen.title + ' в приложении «Сезон»'}
                    width={780}
                    height={1688}
                    loading="lazy"
                    decoding="async"
                  />
                  <span className="welcome-gallery-zoom" aria-hidden="true">
                    <Expand size={18} />
                  </span>
                </span>
                <span className="welcome-gallery-caption">
                  <strong>{screen.title}</strong>
                  <span>{screen.description}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <article className="welcome-gallery-demo" aria-labelledby="demo-title">
          <div className="welcome-gallery-demo-heading">
            <span className="welcome-icon" aria-hidden="true">
              <Film size={25} />
            </span>
            <div>
              <h4 id="demo-title">Видео: {content.label.toLocaleLowerCase('ru')}</h4>
              <p id="demo-description">{content.video}</p>
            </div>
          </div>
          <GalleryVideo
            key={mediaPath}
            mediaPath={mediaPath}
            title={`${content.title} — ${theme === 'light' ? 'светлая' : 'тёмная'} тема`}
          />
          <p id="demo-note" className="welcome-gallery-note">
            Демонстрационные данные. Видео без звука, с пояснениями на экране.
          </p>
        </article>
        {selected !== null && (
          <ScreenshotViewer
            screens={screens}
            theme={theme}
            initialIndex={selected}
            onClose={() => setSelected(null)}
          />
        )}
      </div>
    </section>
  )
}
