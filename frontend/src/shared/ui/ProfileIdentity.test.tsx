import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SessionContext } from '../../features/session/context'
import { createPreviewSession } from '../../mocks/session'
import { ProfileIdentity } from './ProfileIdentity'

const bridge = {
  initData: '',
  platform: 'web',
  BackButton: { show: vi.fn(), hide: vi.fn(), onClick: vi.fn(), offClick: vi.fn() },
}

describe('MAX profile identity', () => {
  it('falls back to the API name when MAX does not supply a name', () => {
    const session = createPreviewSession()
    session.bridge = { ...bridge, initDataUnsafe: { user: { first_name: '  ' } } }
    render(
      <SessionContext value={session}>
        <ProfileIdentity name="Никита" />
      </SessionContext>,
    )
    expect(screen.getByText('Никита')).toBeInTheDocument()
  })
  it('keeps the current MAX name and avatar together even when the API name is stale', () => {
    const session = createPreviewSession()
    session.bridge = {
      ...bridge,
      initDataUnsafe: {
        user: { first_name: 'Никита', photo_url: 'https://example.test/avatar.png' },
      },
    }
    const { container } = render(
      <SessionContext value={session}>
        <ProfileIdentity name="Дмитрий" />
      </SessionContext>,
    )
    expect(screen.getByText('Никита')).toBeInTheDocument()
    expect(screen.queryByText('Дмитрий')).not.toBeInTheDocument()
    const photo = container.querySelector('img')!
    expect(photo).toHaveAttribute('src', 'https://example.test/avatar.png')
    expect(photo).toHaveAttribute('referrerpolicy', 'no-referrer')
    fireEvent.error(photo)
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('Н')).toBeInTheDocument()
  })
  it.each([
    'http://example.test/avatar.png',
    'https://user:secret@example.test/avatar.png',
    'javascript:alert(1)',
  ])('does not use an unsafe photo URL: %s', (photo_url) => {
    const session = createPreviewSession()
    session.bridge = { ...bridge, initDataUnsafe: { user: { first_name: 'Никита', photo_url } } }
    const { container } = render(
      <SessionContext value={session}>
        <ProfileIdentity />
      </SessionContext>,
    )
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('Никита')).toBeInTheDocument()
  })
})
