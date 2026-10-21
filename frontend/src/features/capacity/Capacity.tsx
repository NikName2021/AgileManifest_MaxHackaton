export function Capacity({
  headcount,
  spotsLeft,
}: {
  headcount?: number | null
  spotsLeft?: number | null
}) {
  if (!headcount) return null
  const hired = spotsLeft == null ? null : Math.min(headcount, Math.max(0, headcount - spotsLeft))
  const percent = hired === null ? null : Math.round((hired / headcount) * 100)
  return (
    <div className="vacancy-capacity">
      <p>
        <strong>{spotsLeft === 0 ? 'Набор завершён:' : 'Квота мест:'}</strong>{' '}
        <span>
          {hired === null
            ? `Нужно ${headcount} человек`
            : `${hired} из ${headcount} набрано (${percent}%)`}
        </span>
      </p>
      {hired !== null && (
        <progress aria-label="Заполнение вакансии" value={hired} max={headcount} />
      )}
    </div>
  )
}

export function RemainingPlaces({ spotsLeft }: { spotsLeft?: number | null }) {
  if (spotsLeft == null) return null
  const suffix =
    spotsLeft % 10 === 1 && spotsLeft % 100 !== 11
      ? 'место'
      : [2, 3, 4].includes(spotsLeft % 10) && ![12, 13, 14].includes(spotsLeft % 100)
        ? 'места'
        : 'мест'
  return (
    <span className={`remaining-places ${spotsLeft > 0 && spotsLeft < 5 ? 'few' : ''}`}>
      {spotsLeft === 0 ? 'Набор завершён' : `Осталось ${spotsLeft} ${suffix}`}
    </span>
  )
}
