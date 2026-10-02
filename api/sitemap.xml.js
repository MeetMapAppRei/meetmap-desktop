import { createClient } from '@supabase/supabase-js'

const SITE_ORIGIN = 'https://www.findcarmeets.com'

/** City slugs with static landing pages under public/car-meets-in-<slug>/ */
const STATIC_CITY_SLUGS = [
  'dallas',
  'houston',
  'los-angeles',
  'miami',
  'atlanta',
  'phoenix',
  'new-york',
  'chicago',
  'san-diego',
  'san-jose',
  'austin',
  'charlotte',
  'orlando',
  'tampa',
  'nashville',
  'seattle',
  'denver',
  'las-vegas',
  'philadelphia',
  'san-antonio',
  'jacksonville',
  'sacramento',
  'columbus',
  'detroit',
  'kansas-city',
  'portland',
]

function xmlEscape(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function buildUrlEntry({ loc, changefreq, priority, lastmod }) {
  const bits = [
    `<loc>${xmlEscape(loc)}</loc>`,
    lastmod ? `<lastmod>${xmlEscape(lastmod)}</lastmod>` : '',
    changefreq ? `<changefreq>${xmlEscape(changefreq)}</changefreq>` : '',
    priority != null ? `<priority>${priority}</priority>` : '',
  ].filter(Boolean)
  return `  <url>\n    ${bits.join('\n    ')}\n  </url>`
}

function slugFromCityLabel(cityLabel) {
  return String(cityLabel || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function staticSlugForCitySlug(citySlug) {
  if (!citySlug) return ''
  if (STATIC_CITY_SLUGS.includes(citySlug)) return citySlug
  return STATIC_CITY_SLUGS.find((s) => citySlug === s || citySlug.startsWith(`${s}-`)) || ''
}

async function fetchCityLastmods() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return new Map()

  const supabase = createClient(url, key, { auth: { persistSession: false } })
  const today = new Date().toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from('events')
    .select('city, created_at, updated_at, date')
    .gte('date', today)
    .order('date', { ascending: true })
    .limit(5000)

  if (error) {
    console.error('[sitemap] supabase error:', error)
    return new Map()
  }

  const lastmods = new Map()
  for (const row of data || []) {
    const citySlug = slugFromCityLabel(row?.city)
    const slug = staticSlugForCitySlug(citySlug)
    if (!slug) continue
    const ts = row?.updated_at || row?.created_at || ''
    const day = ts ? String(ts).slice(0, 10) : ''
    const prev = lastmods.get(slug)
    if (!prev || (day && day > prev)) lastmods.set(slug, day)
  }
  return lastmods
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    return res.end('Method not allowed')
  }

  res.setHeader('Content-Type', 'application/xml; charset=utf-8')
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')

  const now = new Date().toISOString().slice(0, 10)
  const cityLastmods = await fetchCityLastmods()

  const urls = [
    buildUrlEntry({
      loc: `${SITE_ORIGIN}/`,
      changefreq: 'daily',
      priority: '1.0',
      lastmod: now,
    }),
  ]

  for (const slug of STATIC_CITY_SLUGS) {
    urls.push(
      buildUrlEntry({
        loc: `${SITE_ORIGIN}/car-meets-in-${slug}/`,
        changefreq: 'daily',
        priority: '0.9',
        lastmod: cityLastmods.get(slug) || now,
      }),
    )
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join(
    '\n',
  )}\n</urlset>\n`
  return res.status(200).end(xml)
}
