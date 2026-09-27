export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand">
      <span className="brand-name">
        {compact ? 'с' : 'сезон'}
        <span className="brand-period" aria-hidden="true">
          .
        </span>
      </span>
    </span>
  )
}
