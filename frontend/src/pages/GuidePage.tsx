import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@maxhub/max-ui'
import { MaxLogo } from '../shared/ui/MaxLogo'
import { config } from '../shared/config'

export function GuidePage() {
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Помощь работодателю</span>
          <h1>Как работает сервис</h1>
          <p>От публикации вакансии до выхода сотрудника на работу.</p>
        </div>
      </div>
      <div className="guide-layout">
        <section className="guide-list" aria-label="Инструкция по найму">
          <article>
            <span className="guide-number">01</span>
            <div>
              <h2>Подготовьте вакансию</h2>
              <p>
                Укажите должность, место работы, тип занятости, оплату и требования. Добавьте
                контакт для связи. Сохраните черновик — его можно редактировать до публикации.
              </p>
              <Link className="guide-action" to="/vacancies/new">
                Создать вакансию <ArrowRight size={15} />
              </Link>
            </div>
          </article>
          <article>
            <span className="guide-number">02</span>
            <div>
              <h2>Опубликуйте и поделитесь</h2>
              <p>
                Начните личный чат с ботом в MAX. Проверьте черновик и подтвердите публикацию в
                кабинете. Бот пришлёт карточку: перешлите её в местные чаты и сообщества.
              </p>
              <div className="guide-note">
                Если кнопка отклика недоступна в пересланной карточке, кандидат может перейти в
                личный чат с ботом по ссылке на ней.
              </div>
              <p>
                Если отправка карточки не подтверждена, сначала проверьте чат с ботом и нажмите
                «Проверить состояние» в вакансии. Если карточки нет, отметьте это и подтвердите
                «Повторить отправку». После тайм-аута первая карточка могла дойти — тогда повтор
                может создать дубль сообщения.
              </p>
            </div>
          </article>
          <article>
            <span className="guide-number">03</span>
            <div>
              <h2>Свяжитесь с кандидатами</h2>
              <p>
                В разделе «Отклики» доступны контакты и текущий этап каждого кандидата. Отфильтруйте
                список по вакансии или статусу. После разговора обновите этап найма.
              </p>
              <div className="funnel-example" aria-label="Этапы найма">
                {['Новый', 'На связи', 'Приглашён', 'Нанят / Отказ'].map((label, index) => (
                  <span key={label}>
                    {index > 0 && <ArrowRight size={13} />} {label}
                  </span>
                ))}
              </div>
              <p>
                При приглашении, найме или отказе бот отправляет уведомление. Если сообщение не
                отправилось, статус всё равно сохранится, а кабинет покажет предупреждение.
              </p>
              <Link className="guide-action" to="/applications">
                Перейти к откликам <ArrowRight size={15} />
              </Link>
            </div>
          </article>
          <article>
            <span className="guide-number">04</span>
            <div>
              <h2>Завершите подбор</h2>
              <p>
                Когда сотрудник найден, закройте вакансию. Новые отклики больше не принимаются.
                Полученные контакты и работа с кандидатами остаются доступны в кабинете.
              </p>
              <p>
                Для следующего сезона откройте прежнюю вакансию и нажмите «Создать копию». Проверьте
                условия, сохраните новый черновик и отдельно подтвердите публикацию. Отклики
                останутся у прежней вакансии.
              </p>
            </div>
          </article>
        </section>
        <aside className="guide-aside">
          <MaxLogo />
          <h2>Бот и кабинет работают вместе</h2>
          <p>
            Для входа с реальными данными откройте мини-приложение из MAX. Ваши вакансии и отклики
            будут доступны после авторизации.
          </p>
          {config.botUrl && (
            <Button asChild className="primary-button">
              <a href={config.botUrl} target="_blank" rel="noopener noreferrer">
                Перейти в MAX <ArrowRight size={16} />
              </a>
            </Button>
          )}
          <div className="guide-aside-rule" />
          <h3>Что указать в вакансии</h3>
          <ul>
            <li>Понятное название должности</li>
            <li>Место и даты работы</li>
            <li>Оплату и период расчёта</li>
            <li>Обязанности и требования</li>
            <li>Способ связи с работодателем</li>
          </ul>
        </aside>
      </div>
    </>
  )
}
