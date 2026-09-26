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
          <p>От черновика вакансии до знакомства с кандидатом.</p>
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
                Создайте вакансию в этом приложении: укажите должность, место работы, график, оплату
                и требования. Сохраните черновик и проверьте содержание. Пока он не опубликован, его
                можно редактировать.
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
                Начните личный чат с ботом, затем подтвердите публикацию в приложении. Перешлите
                полученную карточку в подходящие чаты MAX. Кандидат сможет перейти в бота по кнопке
                отклика и оставить контакт.
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
                Уведомления об откликах приходят в бота. Свяжитесь с человеком и договоритесь о
                работе. Список кандидатов и смена статусов в мини-приложении появятся на следующем
                этапе. Когда поиск закончен, закройте вакансию.
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
