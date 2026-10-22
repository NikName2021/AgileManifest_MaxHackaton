import { useState } from 'react'
import { useSession } from '../../features/session/context'

export function ProfileIdentity({
  name,
  subtitle = 'Профиль MAX',
}: {
  name?: string | null
  subtitle?: string
}) {
  const { user, bridge } = useSession()
  const [failed, setFailed] = useState(false)
  const nativeUser = bridge?.initDataUnsafe?.user
  const displayName =
    [nativeUser?.first_name?.trim(), nativeUser?.last_name?.trim()].filter(Boolean).join(' ') ||
    name?.trim() ||
    user.display_name
  let photo: string | undefined
  try {
    const url = new URL(nativeUser?.photo_url ?? '')
    if (url.protocol === 'https:' && !url.username && !url.password) photo = url.href
  } catch {
    /* An absent avatar is represented by initials. */
  }
  return (
    <div className="profile-identity">
      <span className="profile-avatar">
        {photo && !failed ? (
          <img src={photo} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
        ) : (
          <span aria-hidden="true">{displayName.slice(0, 1).toLocaleUpperCase('ru')}</span>
        )}
      </span>
      <div>
        <strong>{displayName}</strong>
        <span>{subtitle}</span>
      </div>
    </div>
  )
}
