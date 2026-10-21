import { useState } from 'react'
import { useSession } from '../../features/session/context'

export function ProfileIdentity({ name }: { name?: string | null }) {
  const { user, bridge } = useSession()
  const [failed, setFailed] = useState(false)
  const nativeUser = bridge?.initDataUnsafe?.user
  const displayName =
    name?.trim() ||
    [nativeUser?.first_name, nativeUser?.last_name].filter(Boolean).join(' ') ||
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
        <span>Профиль MAX</span>
      </div>
    </div>
  )
}
