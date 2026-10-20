export function Capacity({
  headcount,
  spotsLeft,
}: {
  headcount?: number | null
  spotsLeft?: number | null
}) {
  if (!headcount) return null
  return (
    <p className="vacancy-notice">
      {spotsLeft == null
        ? `Набор: ${headcount} человек`
        : spotsLeft === 0
          ? 'Все места заняты'
          : `Осталось ${spotsLeft} из ${headcount} мест`}
    </p>
  )
}
