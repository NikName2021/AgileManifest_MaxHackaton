export function VacancySteps({ current }: { current: 1 | 2 }) {
  return (
    <ol className="vacancy-steps" aria-label="Создание вакансии">
      <li aria-current={current === 1 ? 'step' : undefined} className={current >= 1 ? 'done' : ''}>
        <span>1</span> Условия
      </li>
      <li aria-current={current === 2 ? 'step' : undefined} className={current === 2 ? 'done' : ''}>
        <span>2</span> Проверка
      </li>
    </ol>
  )
}
