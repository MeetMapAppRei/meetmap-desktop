const NOMINATIM = 'https://nominatim.openstreetmap.org/search'
const MAPBOX_TOKEN = String(import.meta.env.VITE_MAPBOX_TOKEN || '').trim()

export async function geocodeAddress(address, options = {}) {
  const { retries = 3, retryDelayMs = 600 } = options
  if (!address || !String(address).trim()) return null

  const query = String(address).trim()
  const q = encodeURIComponent(query)
  const url = `${NOMINATIM}?q=${q}&format=json&limit=1&addressdetails=1`

  let lastError
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, retryDelayMs * attempt))
      }
      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'MeetMap/1.0 (+https://findcarmeets.com)',
        },
      })
      if (!res.ok) {
        lastError = new Error(`Geocoding failed (${res.status})`)
        continue
      }
      const data = await res.json()
      if (Array.isArray(data) && data.length > 0) {
        return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
      }
      if (MAPBOX_TOKEN) {
        const mbUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${encodeURIComponent(MAPBOX_TOKEN)}&limit=1&country=us`
        const mbRes = await fetch(mbUrl, { headers: { Accept: 'application/json' } })
        if (mbRes.ok) {
          const mb = await mbRes.json().catch(() => null)
          const coords = mb?.features?.[0]?.center
          if (Array.isArray(coords) && coords.length >= 2) {
            return { lng: Number(coords[0]), lat: Number(coords[1]) }
          }
        }
      }
      return null
    } catch (e) {
      lastError = e
    }
  }
  throw lastError
}

