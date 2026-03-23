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
  const bases = [
    primary.startsWith('http') ? primary : null,
    typeof window !== 'undefined' && primary.startsWith('/') ? `${window.location.origin}${primary}` : null,
    'https://findcarmeets.com',
    'https://www.findcarmeets.com',
    'https://meetmap-gilt.vercel.app',
  ].filter(Boolean)
  return [...new Set(bases)]
}
