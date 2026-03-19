export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
}

const PROMPT = `Extract car meet event info from this flyer. Return ONLY a JSON object with these fields (no markdown, no explanation):
{
  "title": "event name",
  "type": "meet|car show|track day|cruise",
  "date": "YYYY-MM-DD",
  "time": "HH:MM",
  "location": "venue/spot name",
  "address": "full street address if visible",
  "city": "City, ST",
  "host": "organizer name",
  "description": "any details about the event",
  "tags": "comma separated tags like JDM, All Makes, etc"
}
If a field is not found, use empty string. For date, convert to YYYY-MM-DD format using the current year ${new Date().getFullYear()} if no year is specified on the flyer. For time use 24hr format.`

function guessMediaTypeFromUrl(url) {
  const u = String(url || '').toLowerCase()
  if (u.includes('.png')) return 'image/png'
  if (u.includes('.webp')) return 'image/webp'
  if (u.includes('.gif')) return 'image/gif'
  return 'image/jpeg'
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { imageUrl, sourceUrl, imageBase64, mediaType: mediaTypeInput } = req.body || {}
    if (!imageUrl && !imageBase64) return res.status(400).json({ error: 'Missing imageUrl or imageBase64' })

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return res.status(500).json({ error: 'API key not configured' })

    // If the client already uploaded the image bytes, use that directly.
    if (imageBase64) {
      const mt = typeof mediaTypeInput === 'string' && mediaTypeInput.startsWith('image/')
        ? mediaTypeInput
        : guessMediaTypeFromUrl(imageUrl)

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: { type: 'base64', media_type: mt || 'image/jpeg', data: String(imageBase64) },
                },
                { type: 'text', text: PROMPT },
              ],
            },
          ],
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        console.error('Anthropic error:', data)
        const err =
          data?.error?.message ||
          data?.message ||
          (typeof data?.error === 'string' ? data.error : null) ||
          JSON.stringify(data)
        return res.status(response.status).json({ error: err, status: response.status })
      }

      const text = data.content?.[0]?.text || ''
      const clean = text.replace(/```json|```/g, '').trim()
      const extracted = JSON.parse(clean)
      return res.status(200).json({ extracted })
    }

    const referer =
      typeof sourceUrl === 'string' && sourceUrl
        ? sourceUrl
        : 'https://www.instagram.com/'
    const origin =
      typeof sourceUrl === 'string' && sourceUrl
        ? (() => {
          try {
            return new URL(sourceUrl).origin
          } catch {}
          return 'https://www.instagram.com'
        })()
        : 'https://www.instagram.com'

    const commonHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Safari/537.36',
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      Referer: referer,
      Origin: origin,
    }

    const candidates = []
    const pushCandidate = (v) => {
      if (!v || typeof v !== 'string') return
      candidates.push(v)
    }
    try {
      const u = new URL(imageUrl)
      pushCandidate(u.toString())

      const noQuery = new URL(u.toString())
      noQuery.search = ''
      pushCandidate(noQuery.toString())

      const keepSig = new URL(u.toString())
      for (const [k] of keepSig.searchParams.entries()) {
        if (k !== 'oh' && k !== 'oe') keepSig.searchParams.delete(k)
      }
      pushCandidate(keepSig.toString())

      const rmStp = new URL(u.toString())
      rmStp.searchParams.delete('stp')
      pushCandidate(rmStp.toString())

      const upscale = u.pathname.replace(/\/s\d+x\d+\//i, '/s1080x1080/')
      if (upscale !== u.pathname) {
        const up = new URL(u.toString())
        up.pathname = upscale
        pushCandidate(up.toString())
      }
    } catch {
      pushCandidate(imageUrl)
    }

    const uniqueCandidates = []
    for (const c of candidates) {
      if (!uniqueCandidates.includes(c)) uniqueCandidates.push(c)
    }

    let imgRes = null
    let lastRes = null
    for (const candidateUrl of uniqueCandidates) {
      try {
        let resTry = await fetch(candidateUrl, {
          headers: commonHeaders,
          redirect: 'follow',
          cache: 'no-store',
        })

        if (!resTry.ok && (resTry.status === 403 || resTry.status === 429)) {
          resTry = await fetch(candidateUrl, {
            headers: { ...commonHeaders, Referer: 'https://www.instagram.com/' },
            redirect: 'follow',
            cache: 'no-store',
          })
        }

        lastRes = resTry
        if (resTry.ok) {
          imgRes = resTry
          break
        }
      } catch {
        lastRes = null
      }
    }

    // Prefer base64 (we already fetched the image), but when Instagram blocks
    // the server-side fetch (403/429) we fall back to passing the URL
    // directly to Claude.
    let imageBlock = { type: 'image', source: { type: 'url', url: imageUrl } }

    if (imgRes && imgRes.ok) {
      const arrayBuffer = await imgRes.arrayBuffer()
      const base64 = Buffer.from(arrayBuffer).toString('base64')

      const contentTypeRaw = imgRes.headers.get('content-type') || 'image/jpeg'
      const contentType = contentTypeRaw.split(';')[0].trim()
      const mediaType = contentType.startsWith('image/') ? contentType : 'image/jpeg'

      imageBlock = {
        type: 'image',
        source: { type: 'base64', media_type: mediaType, data: base64 },
      }
    } else {
      try {
        const contentType = lastRes?.headers?.get('content-type') || ''
        let snippet = null
        if (contentType.includes('text') || contentType.includes('json') || contentType.includes('html')) {
          snippet = lastRes ? (await lastRes.text()).slice(0, 120) : null
        }
      } catch {}
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: [
              imageBlock,
              { type: 'text', text: PROMPT },
            ],
          },
        ],
      }),
    })

    const data = await response.json()
    if (!response.ok) {
      console.error('Anthropic error:', data)
      const err =
        data?.error?.message ||
        data?.message ||
        (typeof data?.error === 'string' ? data.error : null) ||
        JSON.stringify(data)
      return res.status(response.status).json({ error: err, status: response.status })
    }

    const text = data.content?.[0]?.text || ''
    const clean = text.replace(/```json|```/g, '').trim()
    const extracted = JSON.parse(clean)

    res.status(200).json({ extracted })
  } catch (e) {
    console.error('extract-flyer error:', e)
    res.status(500).json({ error: e.message || 'Failed to extract flyer' })
  }
}

