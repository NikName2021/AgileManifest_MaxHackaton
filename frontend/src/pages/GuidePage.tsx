import { ArrowRight, FilePenLine, Send, UsersRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@maxhub/max-ui'

export function GuidePage() {
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">ЗНАКОМСТВО С СЕРВИСОМ</div>
          <h1>Найм с понятным маршрутом</h1>
          <p>Как будет устроен путь работодателя и кандидата в Сезоне.</p>
        </div>
      </div>
      <div className="guide-layout">
        <section className="guide-list">
          <article>
            <span className="step-icon">
              <FilePenLine size={22} />
            </span>
            <div>
              <span className="section-kicker">ШАГ 01</span>
              <h2>Опишите работу</h2>
              <p>
                Укажите должность, место работы, график, оплату и требования. Перед публикацией
                проверьте карточку: кандидату должно быть понятно, что вы предлагаете.
              </p>
            </div>
          </article>
          <article>
            <span className="step-icon">
              <Send size={22} />
            </span>
            <div>
              <span className="section-kicker">ШАГ 02</span>
              <h2>Найдите свою аудиторию</h2>
              <p>
                Перешлите карточку вакансии из бота в подходящие чаты MAX. Кандидат перейдёт в бота
                по кнопке «Откликнуться» и оставит контакт.
              </p>
            </div>
          </article>
          <article>
            <span className="step-icon">
              <UsersRound size={22} />
            </span>
            <div>
              <span className="section-kicker">ШАГ 03</span>
              <h2>Договоритесь о следующем шаге</h2>
              <p>
                Просмотрите отклик, свяжитесь с человеком и обновите статус. Так будет понятно, кого
                ещё нужно пригласить, а кто уже в команде.
              </p>
              <div className="funnel-example" aria-label="Этапы найма">
                {['Новый', 'На связи', 'Приглашён', 'Нанят'].map((label, index) => (
                  <span key={label}>
                    {index > 0 && <ArrowRight size={13} />}
                    {label}
                  </span>
                ))}
              </div>
            </div>
          </article>
        </section>
        <aside className="guide-aside">
          <span className="section-kicker">НАЧНИТЕ С МАЛОГО</span>
          <h2>
            Одна вакансия.
            <br />
            Одна понятная задача.
          </h2>
          <p>
            Конкретные условия помогают быстрее найти подходящих людей. Укажите оплату, даты и место
            работы ещё до первого разговора.
          </p>
          <Button asChild variant="secondary">
            <Link to="/vacancies">
              К вакансиям <ArrowRight size={17} />
            </Link>
          </Button>
        </aside>
      </div>
    </>
  )
}
