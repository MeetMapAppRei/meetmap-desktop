/**
 * Base URL for same-origin API routes (`/api/...`).
 */
export function getAppOrigin() {
  const raw = import.meta.env.VITE_APP_ORIGIN
  if (raw == null || String(raw).trim() === '') {
    // On web, keep API calls same-origin to avoid CORS issues.
    return ''
  }
  return String(raw).replace(/\/$/, '')
}

/** Where Supabase auth emails (password reset, etc.) should redirect after the user clicks the link. */
export function getAuthRedirectUrl() {
  if (typeof window !== 'undefined' && /^https?:\/\//i.test(window.location?.origin || '')) {
    return window.location.origin
  }
  return getAppOrigin() || 'https://www.findcarmeets.com'
}

/** @param {string} path e.g. `/api/storage-presign` */
export function apiUrl(path) {
  const p = path.startsWith('/') ? path : `/${path}`
  const origin = getAppOrigin()
  return origin ? `${origin}${p}` : p
}

/**
 * Try these API bases when a direct PUT to R2 fails (WebView) or a host is missing a route.
 * @param {string} path e.g. `/api/storage-upload`
 */
export function apiUrlCandidates(path) {
  const p = path.startsWith('/') ? path : `/${path}`
  const primary = apiUrl(p)
  // Never use apex findcarmeets.com for POST — it 308-redirects to www and WebView fetch fails.
  const bases = [
    primary.startsWith('http') ? primary : null,
    typeof window !== 'undefined' && primary.startsWith('/')
      ? `${window.location.origin}${primary}`
      : null,
    `https://www.findcarmeets.com${p}`,
    `https://meetmap-gilt.vercel.app${p}`,
  ].filter(Boolean)
  return [...new Set(bases)]
}
