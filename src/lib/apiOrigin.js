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
