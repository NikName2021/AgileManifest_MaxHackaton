import type { Session } from '../features/session/context'

export const previewSession: Session = {
  mode: 'preview',
  user: {
    id: 'preview-employer',
    max_user_id: 'preview-only',
    display_name: 'Работодатель',
    role: 'employer',
  },
}
