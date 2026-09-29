export interface ContactLink {
  kind: 'phone' | 'email' | 'max'
  href: string
  label: string
}

export function contactLink(raw: string): ContactLink | undefined {
  const value = raw.trim()
  // Only a whole, unambiguous contact becomes an action; free text remains copyable.
  if (/^\+?[\d ()-]+$/.test(value)) {
    const digits = value.replace(/\D/g, '')
    const number =
      /^\+[1-9]\d{6,14}$/.test(`+${digits}`) && value.startsWith('+')
        ? `+${digits}`
        : /^[78]\d{10}$/.test(digits)
          ? `+7${digits.slice(1)}`
          : undefined
    if (number) return { kind: 'phone', href: `tel:${number}`, label: 'Позвонить' }
  }
  if (
    /^[a-z\d.!#$%&'*+/=?^_`{|}~-]+@[a-z\d](?:[a-z\d-]*[a-z\d])?(?:\.[a-z\d](?:[a-z\d-]*[a-z\d])?)+$/i.test(
      value,
    )
  ) {
    return {
      kind: 'email',
      href: `mailto:${encodeURIComponent(value).replace('%40', '@')}`,
      label: 'Написать письмо',
    }
  }
  if (/^https:\/\/max\.ru\/[^\s\\]+$/i.test(value)) {
    const url = new URL(value)
    if (url.pathname !== '/') return { kind: 'max', href: url.href, label: 'Открыть ссылку MAX' }
  }
  return undefined
}
