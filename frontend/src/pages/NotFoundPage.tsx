import { Link } from 'react-router-dom'
import { Button } from '@maxhub/max-ui'
export function NotFoundPage() {
  return (
    <section className="empty-panel">
      <span className="section-kicker">404</span>
      <h1>Здесь пока ничего нет</h1>
      <p>Возможно, в ссылке ошибка. Вернёмся в рабочее пространство.</p>
      <Button asChild className="primary-button">
        <Link to="/">На главную</Link>
      </Button>
    </section>
  )
}
