// MAX supplies these launch parameters in the URL fragment, including in its web client.
// This only selects the entry screen; authentication still validates initData on the server.
export function hasMaxLaunch(): boolean {
  if (window.WebApp?.initData) return true
  return [window.location.hash, window.location.search].some((part) => {
    const params = new URLSearchParams(part.slice(1))
    return params.has('WebAppData') || params.has('WebAppPlatform')
  })
}
