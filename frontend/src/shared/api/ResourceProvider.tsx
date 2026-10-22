import { useEffect, useRef, useState, type ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createResourceClient } from './resourceClient'

// Scoped to an authenticated session; personal data is never persisted to storage.
export function ResourceProvider({ children }: { children: ReactNode }) {
  const [client] = useState(createResourceClient)
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      queueMicrotask(() => {
        if (!mounted.current) client.clear()
      })
    }
  }, [client])
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
