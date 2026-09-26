import { Link } from 'react-router-dom'
import { Button } from '@maxhub/max-ui'
import { ArrowRight, BriefcaseBusiness, UsersRound } from 'lucide-react'
import { config } from '../shared/config'
import { useSession } from '../features/session/context'

export function WorkspacePage({ section }: { section: 'vacancies' | 'applications' }) {
  const { mode } = useSession()
  const vacancies = section === 'vacancies'
  const Icon = vacancies ? BriefcaseBusiness : UsersRound
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">РАБОЧЕЕ ПРОСТРАНСТВО</div>
          <h1>{vacancies ? 'Ваши вакансии' : 'Отклики кандидатов'}</h1>
          <p>
            {vacancies
              ? 'Одна точка для всех открытых позиций.'
              : 'От первого знакомства до приглашения в команду.'}
          </p>
        </div>
      </div>
      <section className="empty-panel">
        <div className="empty-art">
          <Icon size={40} strokeWidth={1.4} />
          <span className="empty-orbit" />
        </div>
        <span className="section-kicker">
          {mode === 'preview' ? 'ПРЕДПРОСМОТР РАЗДЕЛА' : 'РАЗДЕЛ ГОТОВИТСЯ К ЗАПУСКУ'}
        </span>
        <h2>{vacancies ? 'Здесь будут ваши вакансии' : 'Здесь вы познакомитесь с кандидатами'}</h2>
        <p>
          {vacancies
            ? 'Создание и управление вакансиями появятся на следующем этапе. Пока можно познакомиться с процессом найма.'
            : 'Список откликов и смена статусов появятся на следующем этапе. Узнайте, как кандидат проходит путь от отклика до найма.'}
        </p>
        <Button asChild className="primary-button">
          <Link to="/guide">
            Как устроен найм <ArrowRight size={17} />
          </Link>
        </Button>
        {config.botUrl && (
          <a className="text-link" href={config.botUrl}>
            Перейти в бота MAX
          </a>
        )}
      </section>
      <p className="muted-note">
        {mode === 'preview'
          ? 'Это макет раздела, а не результат запроса к базе данных.'
          : 'Данные вакансий и кандидатов в этой версии ещё не загружаются.'}
      </p>
    </>
  )
}
