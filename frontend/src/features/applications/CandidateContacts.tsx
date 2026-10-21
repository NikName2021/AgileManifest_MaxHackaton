import { useRef, useState } from 'react'
import { Button } from '@maxhub/max-ui'
import { Copy, Mail, MessageCircle, Phone } from 'lucide-react'
import type { Application } from '../../entities/hiring'
import { useSession } from '../session/context'
import { candidateContact } from './model'
import { contactLink } from './contactActions'

export function Contact({ value, profile = false }: { value: string; profile?: boolean }) {
  const { bridge } = useSession()
  const [message, setMessage] = useState('')
  const [copying, setCopying] = useState(false)
  const copyLock = useRef(false)
  const parsed = contactLink(value)
  const link = profile && parsed?.kind !== 'phone' ? undefined : parsed
  const Icon = link?.kind === 'phone' ? Phone : link?.kind === 'email' ? Mail : MessageCircle
  async function copy() {
    if (copyLock.current) return
    copyLock.current = true
    setCopying(true)
    setMessage('')
    try {
      await navigator.clipboard.writeText(value)
      setMessage(profile ? 'Телефон профиля скопирован.' : 'Контакт скопирован.')
    } catch {
      setMessage('Не удалось скопировать. Выделите и скопируйте контакт вручную.')
    } finally {
      copyLock.current = false
      setCopying(false)
    }
  }
  return (
    <div className="candidate-contact-item">
      {profile && <p className="secondary-contact">Телефон профиля</p>}
      <div className="candidate-contact-row">
        <p className="candidate-contact-value">{value}</p>
        <div className="candidate-contact-actions">
          <Button
            variant="ghost"
            size="small"
            className="contact-copy-icon"
            disabled={copying}
            aria-label={profile ? 'Копировать телефон профиля' : 'Копировать контакт'}
            onClick={() => void copy()}
          >
            <Copy size={18} aria-hidden="true" />
          </Button>
          {link && (
            <a
              className={`candidate-contact-link${link.kind === 'phone' ? ' contact-phone' : ''}`}
              href={link.href}
              target={link.kind === 'max' ? '_blank' : undefined}
              rel={link.kind === 'max' ? 'noopener noreferrer' : undefined}
              aria-label={profile ? 'Позвонить по телефону профиля' : link.label}
              onClick={(event) => {
                if (
                  link.kind !== 'max' ||
                  !bridge?.openMaxLink ||
                  event.ctrlKey ||
                  event.metaKey ||
                  event.shiftKey ||
                  event.altKey
                )
                  return
                try {
                  bridge.openMaxLink(link.href)
                  event.preventDefault()
                } catch {
                  // A normal link remains available when the native client rejects the call.
                }
              }}
            >
              <Icon size={16} aria-hidden="true" />
              <span className="contact-action-label">{link.label}</span>
            </a>
          )}
        </div>
      </div>
      <p className="copy-result" role="status" aria-live="polite">
        {message}
      </p>
    </div>
  )
}

export function CandidateContacts({ application }: { application: Application }) {
  const contact = candidateContact(application)
  const phone = application.candidate.phone?.trim() || ''
  const phoneLink = contactLink(phone)
  const duplicate =
    contact === phone ||
    (phoneLink?.kind === 'phone' && phoneLink.href === contactLink(contact)?.href)
  return (
    <section className="application-contact">
      <h3>Контакт кандидата</h3>
      {contact ? (
        <Contact key={contact} value={contact} />
      ) : (
        <p>Кандидат не оставил контакт для связи.</p>
      )}
      {phone && !duplicate && <Contact key={`profile:${phone}`} value={phone} profile />}
    </section>
  )
}
