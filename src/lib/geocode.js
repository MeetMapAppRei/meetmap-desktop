/**
 * Forward geocoding for map pins.
 * - Prefer Mapbox (same provider as the map; country=us)
 * - Fallback: Nominatim with countrycodes=us
 */
import { enrichDirectionsQuery } from './eventLocation'

const NOMINATIM = 'https://nominatim.openstreetmap.org/search'
const MAPBOX_TOKEN = String(import.meta.env.VITE_MAPBOX_TOKEN || '').trim()

async function tryMapbox(query) {
  if (!MAPBOX_TOKEN) return null
  const mbUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${encodeURIComponent(MAPBOX_TOKEN)}&limit=1&country=us`
  const mbRes = await fetch(mbUrl, { headers: { Accept: 'application/json' } })
  if (!mbRes.ok) return null
  const mb = await mbRes.json().catch(() => null)
  const center = mb?.features?.[0]?.center
  if (!Array.isArray(center) || center.length < 2) return null
  return { lng: Number(center[0]), lat: Number(center[1]) }
}

async function tryNominatim(query) {
  const url = `${NOMINATIM}?q=${encodeURIComponent(query)}&format=json&limit=1&addressdetails=1&countrycodes=us`
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'MeetMap/1.0 (+https://findcarmeets.com)',
    },
  })
  if (!res.ok) return null
  const data = await res.json()
  if (!Array.isArray(data) || data.length === 0) return null
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
}

export async function geocodeAddress(address, options = {}) {
  const { retries = 3, retryDelayMs = 600, cityHint = '' } = options
  const raw = String(address || '').trim()
  if (!raw) return null

  const query = enrichDirectionsQuery(raw, cityHint)

  let lastError
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, retryDelayMs * attempt))
      }
      const mapbox = await tryMapbox(query)
      if (mapbox) return mapbox
      const nominatim = await tryNominatim(query)
      if (nominatim) return nominatim
      return null
    } catch (e) {
      lastError = e
    }
  }
  throw lastError
}
