export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand">
      <svg className="brand-mark" viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <rect width="40" height="40" rx="13" fill="currentColor" />
        <path d="M11 25V15h6v10h-6Zm12-10h6v10h-6V15Z" fill="white" />
        <path d="m16 15 8 10M16 25l8-10" stroke="white" strokeWidth="4" />
      </svg>
      {!compact && (
        <span className="brand-name">
          сезон<span>найм в MAX</span>
        </span>
      )}
    </span>
  )
}
