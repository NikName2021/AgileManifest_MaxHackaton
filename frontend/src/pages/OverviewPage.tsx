import { Link } from 'react-router-dom'
import { Button } from '@maxhub/max-ui'
import {
  ArrowRight,
  ArrowUpRight,
  BriefcaseBusiness,
  Check,
  CheckCheck,
  FilePenLine,
  MessageCircle,
  Send,
  Sprout,
  UsersRound,
} from 'lucide-react'

const steps = [
  {
    icon: FilePenLine,
    title: 'Расскажите о работе',
    text: 'Должность, график и условия — всё, что нужно будущему сотруднику.',
  },
  {
    icon: Send,
    title: 'Поделитесь вакансией',
    text: 'Отправьте карточку в локальные чаты и сообщества в MAX.',
  },
  {
    icon: UsersRound,
    title: 'Соберите команду',
    text: 'Получайте отклики в боте и ведите кандидатов до выхода на работу.',
  },
]
export function OverviewPage() {
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">ВАШ НОВЫЙ РАБОЧИЙ СЕЗОН</div>
          <h1>
            Хорошая команда.
            <br className="mobile-break" /> Простое начало.
          </h1>
          <p>Вакансии, отклики и общение — ближе друг к другу.</p>
        </div>
        <span className="heading-badge">
          <Sprout size={16} />
          Сезонный найм
        </span>
      </div>
      <section className="welcome-panel" aria-labelledby="welcome-title">
        <div className="welcome-copy">
          <span className="hero-label">
            <span />
            МАЛОМУ БИЗНЕСУ — БОЛЬШЕ ВОЗМОЖНОСТЕЙ
          </span>
          <h2 id="welcome-title">
            Найдите людей.
            <br />
            Займитесь делом.
          </h2>
          <p>
            От первой вакансии до нового сотрудника.
            <br />
            Сезон поможет держать найм под рукой.
          </p>
          <Button asChild className="primary-button" size="large">
            <Link to="/vacancies">
              Мои вакансии <ArrowRight size={18} />
            </Link>
          </Button>
          <Link className="hero-secondary" to="/guide">
            Как работает Сезон <ArrowUpRight size={15} />
          </Link>
        </div>
        <div
          className="hiring-illustration"
          aria-label="Пример пути: вакансия, отклик, новый сотрудник"
        >
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="illustration-card job">
            <div className="illustration-icon">
              <BriefcaseBusiness size={22} />
            </div>
            <div>
              <small>ВАША ВАКАНСИЯ</small>
              <strong>Нужен человек в команду</strong>
              <div className="skeleton-line" />
              <div className="skeleton-line short" />
            </div>
            <span className="illustration-check">
              <Check size={13} />
            </span>
          </div>
          <div className="illustration-card reply">
            <div className="mini-avatar">А</div>
            <div>
              <strong>Давайте познакомимся!</strong>
              <small>Новый отклик в MAX</small>
            </div>
            <MessageCircle size={19} />
          </div>
          <div className="illustration-card hired">
            <span>
              <CheckCheck size={17} />
            </span>
            Ещё один человек в команде
          </div>
          <span className="illustration-caption">ОТ ЗНАКОМСТВА — К СОВМЕСТНОЙ РАБОТЕ</span>
        </div>
      </section>
      <section className="steps-section" aria-labelledby="steps-title">
        <div className="section-title">
          <h2 id="steps-title">Три шага до вашей команды</h2>
          <span>Понятный путь без лишних действий</span>
        </div>
        <div className="steps-grid">
          {steps.map(({ icon: Icon, title, text }, i) => (
            <article className="step-card" key={title}>
              <div className="step-card-top">
                <span className="step-icon">
                  <Icon size={22} strokeWidth={1.7} />
                </span>
                <span className="step-number">0{i + 1}</span>
              </div>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="bottom-note">
        <span className="note-icon">
          <MessageCircle size={23} />
        </span>
        <div>
          <h3>Бот всегда рядом</h3>
          <p>Отклики и уведомления приходят в MAX. Здесь — ваше рабочее пространство.</p>
        </div>
        <Link to="/guide" aria-label="Узнать о работе бота">
          <ArrowUpRight size={21} />
        </Link>
      </section>
    </>
  )
}
