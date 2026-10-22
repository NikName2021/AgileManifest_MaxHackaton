import { QueryClient } from '@tanstack/react-query'

export function createResourceClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 15 * 60_000,
        retry: false,
        refetchOnWindowFocus: false,
        networkMode: 'always',
      },
    },
  })
}
