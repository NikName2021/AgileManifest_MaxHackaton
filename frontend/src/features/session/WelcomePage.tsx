import {
  ArrowRight,
  Bell,
  BriefcaseBusiness,
  Check,
  Copy,
  ChevronDown,
  ExternalLink,
  Megaphone,
  Users,
} from 'lucide-react'
import { useId, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Brand } from '../../shared/ui/Brand'
import { config } from '../../shared/config'
import { WelcomeGallery } from './WelcomeGallery'
import nikitaPhoto from '../../assets/team/nikita.jpg'
import dmitryPhoto from '../../assets/team/dmitry.jpg'
import artemPhoto from '../../assets/team/artem.jpg'
import levPhoto from '../../assets/team/lev.jpg'
import './welcome.css'

const team = [
  { name: 'Лапин Никита', photo: nikitaPhoto },
  { name: 'Дмитрий Лобанов', photo: dmitryPhoto },
  { name: 'Костенов Артем', photo: artemPhoto },
  { name: 'Гурьянов Лев', photo: levPhoto },
]

const questions = [
  [
    'Как открыть «Сезон» с телефона?',
    'Нажмите «Перейти в MAX» и откройте мини-приложение в чате с ботом. Если вы читаете страницу на компьютере, отсканируйте QR-код камерой телефона.',
  ],
  [
    'Как найти работу для студентов?',
    'В кабинете работника откройте вакансии и включите фильтр «Только для студентов». Вы увидите предложения, которые работодатели отметили как подходящие.',
  ],
  [
    'Где посмотреть статус отклика?',
    'Откройте «Мои отклики» в кабинете работника. В карточке виден текущий этап. Когда работодатель назначит смену, там можно подтвердить выход.',
  ],
  [
    'Где работодатель увидит кандидатов?',
    'В кабинете работодателя откройте «Отклики». Выберите кандидата, чтобы посмотреть его отклик, изменить этап найма или назначить смену.',
  ],
]

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <div className="welcome-faq-item">
      <h3>
        <button
          type="button"
          id={id + '-question'}
          aria-expanded={open}
          aria-controls={id + '-answer'}
          onClick={() => setOpen(!open)}
        >
          {question}
          <ChevronDown size={20} aria-hidden="true" />
        </button>
      </h3>
      <div
        className="welcome-faq-answer"
        id={id + '-answer'}
        role="region"
        aria-labelledby={id + '-question'}
        aria-hidden={!open}
        inert={!open}
        data-open={open}
      >
        <div>
          <p>{answer}</p>
        </div>
      </div>
    </div>
  )
}

export function WelcomePage() {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const botUrl = config.botUrl
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(botUrl)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }

  return (
    <div className="welcome-page" id="welcome-top">
      <a className="welcome-skip" href="#welcome-main">
        Перейти к содержимому
      </a>
      <header className="welcome-header welcome-container">
        <a href="#welcome-top" aria-label="Сезон — на главную">
          <Brand />
        </a>
      </header>

      <main id="welcome-main">
        <section className="welcome-hero welcome-container" aria-labelledby="welcome-title">
          <div className="welcome-hero-copy">
            <span className="welcome-eyebrow">
              <span /> Сезонный найм в MAX
            </span>
            <h1 id="welcome-title">
              Новый сезон.
              <br />
              <span>Ваши возможности.</span>
            </h1>
            <p className="welcome-lead">
              Рады видеть вас в «Сезоне»! Находите временную работу или сотрудников прямо в
              привычном мессенджере.
            </p>
            <a className="welcome-button" href={botUrl}>
              Перейти в MAX <ArrowRight size={21} />
            </a>
            <p className="welcome-hint">Откройте бота и запустите мини-приложение.</p>
          </div>
          <div className="welcome-connect">
            <div className="welcome-qr-panel">
              <QRCodeSVG
                value={botUrl}
                size={208}
                level="M"
                marginSize={4}
                bgColor="#ffffff"
                fgColor="#21133d"
                title="QR-код для перехода в бот Сезон в MAX"
              />
            </div>
            <h2>Продолжим в MAX?</h2>
            <p>
              Наведите камеру телефона на QR-код
              <br />
              или перейдите по ссылке.
            </p>
            <div className="welcome-link-row">
              <a href={botUrl}>
                {botUrl.replace(/^https:\/\//, '')}
                <ExternalLink size={15} />
              </a>
              <button
                type="button"
                onClick={() => void copyLink()}
                aria-label="Скопировать ссылку на бота"
              >
                {copyState === 'copied' ? <Check size={18} /> : <Copy size={18} />}
              </button>
            </div>
            <p className="welcome-copy-status" role="status">
              {copyState === 'copied'
                ? 'Ссылка скопирована'
                : copyState === 'failed'
                  ? 'Не удалось скопировать. Ссылку можно выделить вручную.'
                  : '\u00a0'}
            </p>
          </div>
        </section>

        <div className="welcome-benefits welcome-container" aria-label="Возможности сервиса">
          <span>
            <BriefcaseBusiness size={19} /> Сезонная и временная работа
          </span>
          <span>
            <Megaphone size={19} /> Автоматическая рассылка в каналы
          </span>
          <span>
            <Bell size={19} /> Уведомления об откликах
          </span>
        </div>

        <section
          className="welcome-section welcome-container"
          id="welcome-project"
          aria-labelledby="project-title"
        >
          <header className="welcome-section-heading">
            <h2 id="project-title">О проекте</h2>
            <p>
              «Сезон» соединяет тех, кто ищет работу на время, и тех, кому нужны сотрудники. От
              знакомства с вакансией до подтверждения выхода на смену.
            </p>
          </header>
          <div className="welcome-audiences">
            <article className="welcome-audience welcome-worker">
              <span className="welcome-icon">
                <BriefcaseBusiness size={25} />
              </span>
              <span className="welcome-card-label">Ищу работу</span>
              <h3>Найдите свой сезон</h3>
              <p>
                Выберите подходящие условия и следите за откликом без бесконечного поиска по чатам.
              </p>
              <ul>
                <li>
                  <Check size={17} />
                  Вакансии по региону и сфере деятельности
                </li>
                <li>
                  <Check size={17} />
                  Предложения, подходящие студентам
                </li>
                <li>
                  <Check size={17} />
                  Этапы отклика и уведомления в MAX
                </li>
              </ul>
              <a href={botUrl}>
                Перейти к поиску <ArrowRight size={18} />
              </a>
            </article>
            <article className="welcome-audience welcome-employer">
              <span className="welcome-icon">
                <Users size={25} />
              </span>
              <span className="welcome-card-label">Ищу сотрудников</span>
              <h3>Соберите свою команду</h3>
              <p>Размещайте вакансии и ведите кандидатов от первого отклика до выхода на работу.</p>
              <ul>
                <li>
                  <Check size={17} />
                  Публикация вакансий с условиями работы
                </li>
                <li>
                  <Check size={17} />
                  Кандидаты и этапы найма в одном кабинете
                </li>
                <li>
                  <Check size={17} />
                  Назначение смен и подтверждение выхода
                </li>
              </ul>
              <a href={botUrl}>
                Перейти к найму <ArrowRight size={18} />
              </a>
            </article>
          </div>
        </section>

        <WelcomeGallery />

        <section
          className="welcome-section welcome-container welcome-about"
          aria-labelledby="about-title"
        >
          <header className="welcome-section-heading">
            <h2 id="about-title">О нас</h2>
            <p>
              Мы — команда «Сезона». Вместе разрабатываем сервис для сезонной и временной занятости,
              в котором путь от поиска вакансии до выхода на смену становится понятнее.
            </p>
            <p>
              Нас четверо — Никита, Дмитрий, Артём и Лев. «Сезон» — наш общий проект, который мы
              вместе развиваем от идеи до работающего приложения. За ним стоят наши решения,
              код и работа над каждой новой версией. Хотим сделать сервис, которым будет удобно
              пользоваться и который поможет людям находить работу и сотрудников.
            </p>
          </header>
          <ul className="welcome-team" aria-label="Команда проекта">
            {team.map(({ name, photo }) => (
              <li key={name}>
                <img
                  src={photo}
                  alt={name}
                  width={640}
                  height={640}
                  loading="lazy"
                  decoding="async"
                />
                <h3>{name}</h3>
              </li>
            ))}
          </ul>
        </section>

        <section
          className="welcome-section welcome-container welcome-faq"
          aria-labelledby="faq-title"
        >
          <header className="welcome-section-heading">
            <h2 id="faq-title">Частые вопросы</h2>
          </header>
          <div>
            {questions.map(([question, answer]) => (
              <FaqItem key={question} question={question} answer={answer} />
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
