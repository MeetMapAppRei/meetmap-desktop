import { useState, useEffect } from 'react'
import { supabase, fetchEvents, signIn, signUp, signOut, createEvent, fetchFlyerImports, createFlyerImport, updateFlyerImportStatus, updateFlyerImport, uploadFlyerImportImage, fetchSavedEventIds, setSavedEventStatus, upsertSavedEvents, fetchEventStatuses, fetchLatestEventUpdates, fetchEventReports, resolveEventReport } from './lib/supabase'
import { ThemeProvider, useTheme } from './lib/ThemeContext'
import MapView from './components/MapView'
import EventPanel from './components/EventPanel'
import PostEventModal from './components/PostEventModal'
import EventDetail from './components/EventDetail'
import AuthModal from './components/AuthModal'
import ImportQueueModal from './components/ImportQueueModal'
import ModerationQueueModal from './components/ModerationQueueModal'

const TYPE_COLORS = { meet: '#FF6B35', 'car show': '#FFD700', 'track day': '#00D4FF', cruise: '#7CFF6B' }
const parseCsvEnv = (value) =>
  String(value || '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean)

const IMPORT_ADMIN_EMAILS = parseCsvEnv(import.meta.env.VITE_IMPORT_ADMIN_EMAILS).map(v => v.toLowerCase())
const IMPORT_ADMIN_USER_IDS = parseCsvEnv(import.meta.env.VITE_IMPORT_ADMIN_USER_IDS)
const REMINDER_WINDOWS = [
  { id: '24h', leadMs: 24 * 60 * 60 * 1000, windowMs: 60 * 60 * 1000 },
  { id: '2h', leadMs: 2 * 60 * 60 * 1000, windowMs: 20 * 60 * 1000 },
]
const CITY_LINKS = [
  { slug: 'dallas', label: 'Dallas' },
  { slug: 'houston', label: 'Houston' },
  { slug: 'los-angeles', label: 'Los Angeles' },
  { slug: 'miami', label: 'Miami' },
  { slug: 'atlanta', label: 'Atlanta' },
  { slug: 'phoenix', label: 'Phoenix' },
  { slug: 'new-york', label: 'New York' },
  { slug: 'chicago', label: 'Chicago' },
  { slug: 'san-diego', label: 'San Diego' },
  { slug: 'austin', label: 'Austin' },
  { slug: 'charlotte', label: 'Charlotte' },
  { slug: 'orlando', label: 'Orlando' },
]

const isImportAdminUser = (user) => {
  if (!user) return false
  const email = String(user.email || '').toLowerCase()
  return IMPORT_ADMIN_EMAILS.includes(email) || IMPORT_ADMIN_USER_IDS.includes(user.id)
}
const getSavedEventsStorageKey = (user) => `meetmap:saved-events:${user?.id || 'anon'}`
const getReminderLogStorageKey = (user) => `meetmap:sent-reminders:${user?.id || 'anon'}`
const getStatusSnapshotStorageKey = (user) => `meetmap:status-snapshot:${user?.id || 'anon'}`
const getStatusNotifiedStorageKey = (user) => `meetmap:status-notified:${user?.id || 'anon'}`
const getUpdateSnapshotStorageKey = (user) => `meetmap:update-snapshot:${user?.id || 'anon'}`
const getUpdateNotifiedStorageKey = (user) => `meetmap:update-notified:${user?.id || 'anon'}`

const eventStartMs = (event) => {
  if (!event?.date) return null
  const timePart = event.time && /^\d{2}:\d{2}/.test(event.time) ? event.time : '00:00'
  const dt = new Date(`${event.date}T${timePart}`)
  const ms = dt.getTime()
  return Number.isFinite(ms) ? ms : null
}

function AppInner() {
  // Redirect human mobile users to the mobile app. Keep search crawlers on
  // the desktop URL so findcarmeets.com remains indexable.
  useEffect(() => {
    const ua = navigator.userAgent || ''
    const isBot = /Googlebot|Google-InspectionTool|AdsBot|Bingbot|DuckDuckBot|YandexBot|Baiduspider|Slurp|facebookexternalhit|Twitterbot|LinkedInBot/i.test(ua)
    const isMobile = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(ua)
    const isMobileSite = window.location.hostname === 'meetmap-gilt.vercel.app'
    if (!isBot && isMobile && !isMobileSite) {
      const { pathname, search, hash } = window.location
      window.location.href = `https://meetmap-gilt.vercel.app${pathname}${search}${hash}`
    }
  }, [])

  const { isLight, toggleTheme } = useTheme()

  const [user, setUser] = useState(null)
  const [events, setEvents] = useState([])
  const [filtered, setFiltered] = useState([])
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [hoveredEvent, setHoveredEvent] = useState(null)
  const [showPost, setShowPost] = useState(false)
  const [showAuth, setShowAuth] = useState(false)
  const [search, setSearch] = useState('')
  const [activeCityFilter, setActiveCityFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [showPast, setShowPast] = useState(false)
  const [showCanceled, setShowCanceled] = useState(false)
  const [showGoingOnly, setShowGoingOnly] = useState(false)
  const [showSavedOnly, setShowSavedOnly] = useState(false)
  const [savedEventIds, setSavedEventIds] = useState([])
  const [savedSyncAvailable, setSavedSyncAvailable] = useState(true)
  const [notificationPermission, setNotificationPermission] = useState(
    typeof window !== 'undefined' && 'Notification' in window ? window.Notification.permission : 'unsupported'
  )
  const [loading, setLoading] = useState(true)
  const [mapCenter, setMapCenter] = useState(null)

  const RADIUS_MILES = 25
  const [nearMeOnly, setNearMeOnly] = useState(false)
  const [nearMeCoords, setNearMeCoords] = useState(null)
  const [nearMeError, setNearMeError] = useState('')

  const [showImportQueue, setShowImportQueue] = useState(false)
  const [showModerationQueue, setShowModerationQueue] = useState(false)
  const [imports, setImports] = useState([])
  const [importsLoading, setImportsLoading] = useState(false)
  const [moderationReports, setModerationReports] = useState([])
  const [moderationLoading, setModerationLoading] = useState(false)
  const [moderationResolvingReportId, setModerationResolvingReportId] = useState(null)
  const [approvingImportId, setApprovingImportId] = useState(null)
  const [importProcessing, setImportProcessing] = useState(false)
  const [importParams, setImportParams] = useState(null) // { sourceUrl, imageUrl }
  const [importError, setImportError] = useState(null)
  const [importUploading, setImportUploading] = useState(false)
  const [sharedEventId, setSharedEventId] = useState(null)
  const canAccessImports = isImportAdminUser(user)

  const topBtnBorder = isLight ? '#E5E5E5' : '#1E1E1E'
  const topBtnColor = isLight ? '#444' : '#555'
  const topBtnBg = isLight ? '#FFFFFF' : 'none'
  const navBtnHeight = 36
  const navBtnPaddingX = 12
  const navBtnBorderRadius = 10
  const filterChipBg = isLight ? '#F2F2F2' : '#1A1A1A'
  const filterChipBorder = isLight ? '#E5E5E5' : '#2A2A2A'
  const filterChipText = isLight ? '#4A4A4A' : '#A8A8A8'

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user || null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => setUser(session?.user || null))
    return () => subscription.unsubscribe()
  }, [])

  // Reload events whenever showPast or typeFilter changes
  useEffect(() => {
    loadEvents()
  }, [showPast, typeFilter])

  useEffect(() => {
    let result = events
    if (typeFilter !== 'all') result = result.filter(e => e.type === typeFilter)
    if (search) result = result.filter(e =>
      String(e.title || '').toLowerCase().includes(search.toLowerCase()) ||
      String(e.city || '').toLowerCase().includes(search.toLowerCase()) ||
      String(e.location || '').toLowerCase().includes(search.toLowerCase()) ||
      String(e.address || '').toLowerCase().includes(search.toLowerCase()) ||
      (Array.isArray(e.tags) ? e.tags : []).some(t => String(t || '').toLowerCase().includes(search.toLowerCase()))
    )
    setFiltered(result)
  }, [events, search, typeFilter])

  // Allow homepage city links to open the app with a prefilled city search.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const cityParam = (params.get('city') || '').trim()
    const eventParam = (params.get('event') || '').trim()
    if (eventParam) setSharedEventId(eventParam)
    if (!cityParam) return
    setSearch(cityParam)
    setActiveCityFilter(cityParam)
    // Remove only city query and keep event deep-link if present.
    const next = new URL(window.location.href)
    next.searchParams.delete('city')
    window.history.replaceState({}, '', `${next.pathname}${next.search}`)
  }, [])

  useEffect(() => {
    if (!sharedEventId || !Array.isArray(events) || events.length === 0) return
    const match = events.find(e => e.id === sharedEventId)
    if (!match) return
    setSelectedEvent(match)
    if (match.lat && match.lng) setMapCenter({ lat: match.lat, lng: match.lng })
    setSharedEventId(null)
  }, [sharedEventId, events])

  useEffect(() => {
    let active = true
    const loadSavedEvents = async () => {
      let localIds = []
      try {
        const raw = window.localStorage.getItem(getSavedEventsStorageKey(user))
        const parsed = raw ? JSON.parse(raw) : []
        localIds = Array.isArray(parsed) ? parsed : []
      } catch {
        localIds = []
      }

      // Anonymous users stay local-only.
      if (!user) {
        if (active) {
          setSavedSyncAvailable(true)
          setSavedEventIds(localIds)
        }
        return
      }

      try {
        const cloudIds = await fetchSavedEventIds(user.id)
        const merged = Array.from(new Set([...localIds, ...cloudIds]))
        if (active) {
          setSavedSyncAvailable(true)
          setSavedEventIds(merged)
        }
        // Push any local IDs to cloud on first authenticated load.
        await upsertSavedEvents(user.id, merged)
      } catch (e) {
        console.error('Saved events cloud sync unavailable:', e)
        if (active) {
          setSavedSyncAvailable(false)
          setSavedEventIds(localIds)
        }
      }
    }

    loadSavedEvents()
    return () => {
      active = false
    }
  }, [user])

  useEffect(() => {
    try {
      window.localStorage.setItem(getSavedEventsStorageKey(user), JSON.stringify(savedEventIds))
    } catch {}
  }, [user, savedEventIds])

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    setNotificationPermission(window.Notification.permission)
  }, [])

  const loadEvents = async () => {
    setLoading(true)
    try {
      const data = await fetchEvents({ showPast, type: typeFilter, search })
      setEvents(data || [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const handleEventAdded = (event) => {
    setEvents(prev => [event, ...prev])
    setSelectedEvent(event)
  }

  const handleEventDeleted = (id) => {
    setEvents(prev => prev.filter(e => e.id !== id))
    setSelectedEvent(null)
  }

  const handleEventUpdated = (updatedEvent) => {
    if (!updatedEvent) return
    setEvents(prev => prev.map(e => (e.id === updatedEvent.id ? updatedEvent : e)))
    setSelectedEvent(updatedEvent)
  }

  const handleEventClick = (event) => {
    setSelectedEvent(event)
    if (event.lat && event.lng) setMapCenter({ lat: event.lat, lng: event.lng })
    try {
      const url = new URL(window.location.href)
      url.searchParams.set('event', event.id)
      window.history.replaceState({}, '', `${url.pathname}${url.search}`)
    } catch {}
  }

  const handleCloseEventDetail = () => {
    setSelectedEvent(null)
    try {
      const url = new URL(window.location.href)
      url.searchParams.delete('event')
      window.history.replaceState({}, '', `${url.pathname}${url.search}`)
    } catch {}
  }

  const handleToggleSaved = async (eventId) => {
    if (!eventId) return
    let shouldSave = false
    setSavedEventIds(prev => {
      const exists = prev.includes(eventId)
      shouldSave = !exists
      return exists ? prev.filter(id => id !== eventId) : [eventId, ...prev]
    })

    if (user && savedSyncAvailable) {
      try {
        await setSavedEventStatus(user.id, eventId, shouldSave)
      } catch (e) {
        console.error('Failed to sync saved event:', e)
        // Gracefully continue with local persistence when backend table is missing.
        setSavedSyncAvailable(false)
      }
    }
  }

  const handleEnableNotifications = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    try {
      const permission = await window.Notification.requestPermission()
      setNotificationPermission(permission)
    } catch (e) {
      console.error('Notification permission request failed:', e)
    }
  }

  const toRad = (deg) => (deg * Math.PI) / 180
  const distanceMiles = (lat1, lon1, lat2, lon2) => {
    const R = 3958.8 // Earth radius in miles
    const dLat = toRad(lat2 - lat1)
    const dLon = toRad(lon2 - lon1)
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
  }

  async function geocodeAddress(address) {
    if (!address || !address.trim()) return null
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`)
    const data = await res.json()
    if (!data.length) return null
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
  }

  const baseEvents = showSavedOnly
    ? filtered.filter(e => savedEventIds.includes(e.id))
    : filtered

  const statusFilteredEvents = showCanceled
    ? baseEvents
    : baseEvents.filter(e => String(e.status || 'active').toLowerCase() !== 'canceled')

  const goingFilteredEvents = showGoingOnly
    ? statusFilteredEvents.filter(e => Number(e.going_count || 0) > 0)
    : statusFilteredEvents

  const eventsForDisplay = nearMeOnly && nearMeCoords
    ? goingFilteredEvents
      .filter(e => Number.isFinite(e.lat) && Number.isFinite(e.lng) && distanceMiles(nearMeCoords.lat, nearMeCoords.lng, e.lat, e.lng) <= RADIUS_MILES)
      .sort((a, b) => {
        const aStart = eventStartMs(a) ?? Number.POSITIVE_INFINITY
        const bStart = eventStartMs(b) ?? Number.POSITIVE_INFINITY
        if (aStart !== bStart) return aStart - bStart
        // Tie-breaker: keep closer events first when start time matches.
        return distanceMiles(nearMeCoords.lat, nearMeCoords.lng, a.lat, a.lng) -
          distanceMiles(nearMeCoords.lat, nearMeCoords.lng, b.lat, b.lng)
      })
    : goingFilteredEvents

  const upcomingCount = eventsForDisplay.filter(e => e.date >= new Date().toISOString().split('T')[0]).length

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    if (notificationPermission !== 'granted') return
    if (!savedEventIds.length || !events.length) return

    const reminderLogKey = getReminderLogStorageKey(user)
    let reminderLog = {}
    try {
      reminderLog = JSON.parse(window.localStorage.getItem(reminderLogKey) || '{}') || {}
    } catch {
      reminderLog = {}
    }

    const now = Date.now()
    let changed = false
    const savedSet = new Set(savedEventIds)
    const candidateEvents = events.filter(e => savedSet.has(e.id))

    for (const event of candidateEvents) {
      const startMs = eventStartMs(event)
      if (!startMs || startMs <= now) continue
      const eventLog = reminderLog[event.id] || {}

      for (const w of REMINDER_WINDOWS) {
        if (eventLog[w.id]) continue
        const reminderMs = startMs - w.leadMs
        if (now >= reminderMs && now <= reminderMs + w.windowMs) {
          try {
            const when = new Date(startMs).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
            const place = event.address || `${event.location || ''}${event.city ? `, ${event.city}` : ''}`.trim()
            new window.Notification(`Upcoming saved event: ${event.title}`, {
              body: `${when}${place ? ` • ${place}` : ''}`,
              icon: '/og-image.svg',
            })
            eventLog[w.id] = true
            reminderLog[event.id] = eventLog
            changed = true
          } catch (e) {
            console.error('Failed to send reminder notification:', e)
          }
        }
      }
    }

    if (changed) {
      try {
        window.localStorage.setItem(reminderLogKey, JSON.stringify(reminderLog))
      } catch {}
    }
  }, [notificationPermission, savedEventIds, events, user])

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    if (notificationPermission !== 'granted') return
    if (!savedEventIds.length) return

    const snapshotKey = getUpdateSnapshotStorageKey(user)
    const notifiedKey = getUpdateNotifiedStorageKey(user)

    const checkUpdateChanges = async () => {
      try {
        const updateMap = await fetchLatestEventUpdates(savedEventIds)
        let snapshot = {}
        let notified = {}
        try {
          snapshot = JSON.parse(window.localStorage.getItem(snapshotKey) || '{}') || {}
          notified = JSON.parse(window.localStorage.getItem(notifiedKey) || '{}') || {}
        } catch {
          snapshot = {}
          notified = {}
        }

        const nextSnapshot = {}
        const nextNotified = { ...notified }
        const hasBaseline = Object.keys(snapshot).length > 0

        for (const eventId of savedEventIds) {
          const row = updateMap[eventId]
          const signature = row
            ? `${row.latest_update_id || ''}|${row.latest_update_message || ''}|${row.latest_update_created_at || ''}`
            : ''
          const previous = snapshot[eventId] || ''

          if (hasBaseline && signature && previous !== signature && nextNotified[eventId] !== signature) {
            const eventTitle = events.find(e => e.id === eventId)?.title || 'Saved event'
            new window.Notification(`New host update: ${eventTitle}`, {
              body: row.latest_update_message || 'The host posted a new update.',
              icon: '/og-image.svg',
            })
            nextNotified[eventId] = signature
          }

          nextSnapshot[eventId] = signature
        }

        window.localStorage.setItem(snapshotKey, JSON.stringify(nextSnapshot))
        window.localStorage.setItem(notifiedKey, JSON.stringify(nextNotified))
      } catch (e) {
        console.error('Host update notification check failed:', e)
      }
    }

    checkUpdateChanges()
    const interval = window.setInterval(checkUpdateChanges, 90 * 1000)
    return () => window.clearInterval(interval)
  }, [notificationPermission, savedEventIds, events, user])

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    if (notificationPermission !== 'granted') return
    if (!savedEventIds.length) return

    const snapshotKey = getStatusSnapshotStorageKey(user)
    const notifiedKey = getStatusNotifiedStorageKey(user)

    const checkStatusChanges = async () => {
      try {
        const statusMap = await fetchEventStatuses(savedEventIds)
        let snapshot = {}
        let notified = {}
        try {
          snapshot = JSON.parse(window.localStorage.getItem(snapshotKey) || '{}') || {}
          notified = JSON.parse(window.localStorage.getItem(notifiedKey) || '{}') || {}
        } catch {
          snapshot = {}
          notified = {}
        }

        const nextSnapshot = {}
        const nextNotified = { ...notified }
        const hasBaseline = Object.keys(snapshot).length > 0

        for (const eventId of savedEventIds) {
          const row = statusMap[eventId] || { status: 'active', status_note: '', updated_at: '' }
          const status = String(row.status || 'active').toLowerCase()
          const note = row.status_note || ''
          const updatedAt = row.updated_at || ''
          const signature = `${status}|${note}|${updatedAt}`
          const previous = snapshot[eventId]

          if (hasBaseline && previous && previous.signature !== signature && nextNotified[eventId] !== signature) {
            const eventTitle = events.find(e => e.id === eventId)?.title || 'Saved event'
            const label = status === 'canceled'
              ? 'Canceled'
              : status === 'moved'
                ? 'Moved'
                : status === 'delayed'
                  ? 'Delayed'
                  : 'Updated'
            new window.Notification(`Status changed: ${eventTitle}`, {
              body: note ? `${label} • ${note}` : label,
              icon: '/og-image.svg',
            })
            nextNotified[eventId] = signature
          }

          nextSnapshot[eventId] = { signature }
        }

        window.localStorage.setItem(snapshotKey, JSON.stringify(nextSnapshot))
        window.localStorage.setItem(notifiedKey, JSON.stringify(nextNotified))
      } catch (e) {
        console.error('Status change notification check failed:', e)
      }
    }

    checkStatusChanges()
    const interval = window.setInterval(checkStatusChanges, 90 * 1000)
    return () => window.clearInterval(interval)
  }, [notificationPermission, savedEventIds, events, user])

  const requestNearMe = () => {
    setNearMeError('')
    if (!navigator.geolocation) {
      setNearMeError('Geolocation not supported')
      setNearMeOnly(false)
      return
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        setNearMeCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setNearMeOnly(true)
        setMapCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude })
      },
      err => {
        setNearMeError(err.message || 'Could not get location')
        setNearMeOnly(false)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5 * 60 * 1000 }
    )
  }

  const loadPendingImports = async () => {
    if (!user || !canAccessImports) return
    setImportsLoading(true)
    try {
      const data = await fetchFlyerImports(user.id, 'pending')
      setImports(data || [])
    } catch (e) {
      console.error('Failed to load flyer imports:', e)
    } finally {
      setImportsLoading(false)
    }
  }

  const loadPendingModerationReports = async () => {
    if (!user || !canAccessImports) return
    setModerationLoading(true)
    try {
      const data = await fetchEventReports('pending')
      setModerationReports(data || [])
    } catch (e) {
      console.error('Failed to load moderation queue:', e)
    } finally {
      setModerationLoading(false)
    }
  }

  const handleResolveReport = async (reportId) => {
    if (!user) return
    setModerationResolvingReportId(reportId)
    try {
      await resolveEventReport(reportId, user.id, 'resolved')
      setModerationReports(prev => prev.filter(r => r.id !== reportId))
    } catch (e) {
      console.error('Failed to resolve report:', e)
    } finally {
      setModerationResolvingReportId(null)
    }
  }

  const handleIgnoreReport = async (reportId) => {
    if (!user) return
    setModerationResolvingReportId(reportId)
    try {
      await resolveEventReport(reportId, user.id, 'ignored')
      setModerationReports(prev => prev.filter(r => r.id !== reportId))
    } catch (e) {
      console.error('Failed to ignore report:', e)
    } finally {
      setModerationResolvingReportId(null)
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const importFlag = params.get('import')
    if (importFlag !== '1') return

    const sourceUrl = params.get('sourceUrl') || ''
    const imageUrl = params.get('imageUrl') || ''
    if (!sourceUrl || !imageUrl) return

    setImportParams({ sourceUrl, imageUrl })
    setImportError(null)
    setShowImportQueue(true)
  }, [])

  useEffect(() => {
    if (!importParams) return
    if (!user) {
      setShowAuth(true)
      return
    }
    if (!canAccessImports) {
      setImportParams(null)
      setImportError(null)
      setShowImportQueue(false)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [importParams, user, canAccessImports])

  useEffect(() => {
    if (!showImportQueue) return
    if (!user || !canAccessImports) return
    loadPendingImports()
  }, [showImportQueue, user, canAccessImports])

  useEffect(() => {
    if (!showModerationQueue) return
    if (!user || !canAccessImports) return
    loadPendingModerationReports()
  }, [showModerationQueue, user, canAccessImports])

  useEffect(() => {
    if (!importParams) return
    if (!user) return
    if (!canAccessImports) return
    if (!showImportQueue) return

    let cancelled = false
    const run = async () => {
      setImportProcessing(true)
      setImportError(null)
      try {
        const processedKey = `meetmap:import:${user.id}:${importParams.sourceUrl}`
        try {
          if (window.sessionStorage.getItem(processedKey) === '1') {
            setImportParams(null)
            setImportError(null)
            window.history.replaceState({}, '', window.location.pathname)
            await loadPendingImports()
            return
          }
        } catch {}

        const resp = await fetch('/api/extract-flyer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageUrl: importParams.imageUrl, sourceUrl: importParams.sourceUrl }),
        })
        const json = await resp.json()
        if (!resp.ok) {
          const msg = json.error || 'Extraction failed'
          const status = json.status ? ` (status ${json.status})` : ''
          throw new Error(msg + status)
        }
        if (!json?.extracted) throw new Error('No extracted data returned')

        await createFlyerImport({
          userId: user.id,
          sourceUrl: importParams.sourceUrl,
          imageUrl: importParams.imageUrl,
          extracted: json.extracted,
        })

        if (!cancelled) {
          setImportParams(null)
          setImportError(null)
          window.history.replaceState({}, '', window.location.pathname)
          await loadPendingImports()
        }

        try {
          window.sessionStorage.setItem(processedKey, '1')
        } catch {}
      } catch (e) {
        console.error('Import processing failed:', e)
        if (!cancelled) setImportError(e?.message || 'Import processing failed')
      } finally {
        if (!cancelled) setImportProcessing(false)
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [importParams, user, canAccessImports, showImportQueue])

  const handleUploadFlyer = async (file) => {
    if (!canAccessImports) return
    if (!file || !importParams?.sourceUrl) return
    setImportUploading(true)
    setImportError(null)
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader()
        r.onerror = () => reject(new Error('Failed to read file'))
        r.onload = () => resolve(String(r.result || ''))
        r.readAsDataURL(file)
      })

      const m = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/)
      if (!m) throw new Error('Unsupported image file')
      const mediaType = m[1]
      const imageBase64 = m[2]

      const resp = await fetch('/api/extract-flyer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceUrl: importParams.sourceUrl,
          imageUrl: importParams.imageUrl || '',
          imageBase64,
          mediaType,
        }),
      })
      const json = await resp.json()
      if (!resp.ok) {
        const msg =
          typeof json.error === 'string'
            ? json.error
            : json.error
              ? JSON.stringify(json.error)
              : 'Extraction failed'
        const status = json.status ? ` (status ${json.status})` : ''
        throw new Error(msg + status)
      }
      if (!json?.extracted) throw new Error('No extracted data returned')

      if (!user) {
        setImportError('Log in to create this flyer import.')
        setShowAuth(true)
        return
      }

      const storedImageUrl = await uploadFlyerImportImage(file, user.id)

      await createFlyerImport({
        userId: user.id,
        sourceUrl: importParams.sourceUrl,
        imageUrl: storedImageUrl,
        extracted: json.extracted,
      })

      setImportParams(null)
      setImportError(null)
      window.history.replaceState({}, '', window.location.pathname)
      await loadPendingImports()
    } catch (e) {
      setImportError(e?.message || 'Upload failed')
    } finally {
      setImportUploading(false)
    }
  }

  const handleApproveImport = async (imp) => {
    if (!canAccessImports || !user || !imp) return
    setApprovingImportId(imp.id)
    try {
      const required = ['title', 'type', 'date', 'location', 'city']
      const ready = required.every(k => typeof imp?.[k] === 'string' ? imp[k].trim().length > 0 : !!imp?.[k])
      if (!ready) return

      let coords = null
      const query = imp.address?.trim() ? imp.address : `${imp.location || ''}, ${imp.city || ''}`.trim()
      if (query) coords = await geocodeAddress(query).catch(() => null)
      if (query && !coords) {
        throw new Error('Could not find that street address on the map. Try editing the address (include street, city, state, zip).')
      }

      const tags = Array.isArray(imp.tags) ? imp.tags : []

      const created = await createEvent({
        title: imp.title,
        type: imp.type,
        date: imp.date,
        time: imp.time || null,
        location: imp.location,
        city: imp.city,
        address: imp.address || null,
        description: imp.description || null,
        tags,
        host: imp.host || null,
        lat: coords?.lat || null,
        lng: coords?.lng || null,
        photo_url: imp.image_url || null,
      }, user.id)

      await updateFlyerImportStatus(imp.id, 'approved')
      setEvents(prev => [created, ...prev])
      setSelectedEvent(created)
      setShowImportQueue(false)
    } catch (e) {
      console.error('Approve failed:', e)
      setImportError(e?.message || 'Approve failed')
    } finally {
      setApprovingImportId(null)
    }
  }

  const handleRejectImport = async (imp) => {
    if (!canAccessImports || !user || !imp) return
    try {
      await updateFlyerImportStatus(imp.id, 'rejected')
      await loadPendingImports()
    } catch (e) {
      console.error('Reject failed:', e)
    }
  }

  const handleUpdateImport = async (importId, nextDraft) => {
    if (!canAccessImports || !user || !importId || !nextDraft) return
    const tags = (nextDraft.tagsText || '')
      .split(',')
      .map(t => t.trim())
      .filter(Boolean)
    const tagsText = (nextDraft.tagsText || '').trim()

    const updates = {
      title: nextDraft.title?.trim() || null,
      type: nextDraft.type?.trim() || null,
      date: nextDraft.date?.trim() || null,
      time: nextDraft.time?.trim() || null,
      location: nextDraft.location?.trim() || null,
      city: nextDraft.city?.trim() || null,
      address: nextDraft.address?.trim() || null,
      host: nextDraft.host?.trim() || null,
      description: nextDraft.description?.trim() || null,
      tags,
      extracted: {
        title: nextDraft.title || '',
        type: nextDraft.type || '',
        date: nextDraft.date || '',
        time: nextDraft.time || '',
        location: nextDraft.location || '',
        address: nextDraft.address || '',
        city: nextDraft.city || '',
        host: nextDraft.host || '',
        description: nextDraft.description || '',
        tags: tagsText,
      },
    }

    await updateFlyerImport(importId, updates)
    await loadPendingImports()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: isLight ? '#F6F6F6' : '#0A0A0A', overflow: 'hidden' }}>

      {/* TOP NAV */}
      <nav style={{
        height: 58, background: isLight ? '#FFFFFF' : '#0D0D0D', borderBottom: `1px solid ${isLight ? '#E5E5E5' : '#1A1A1A'}`,
        display: 'flex', alignItems: 'center', padding: '0 16px', gap: 16,
        flexShrink: 0, zIndex: 100,
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 8 }}>
          <span style={{ fontSize: 22 }}>🚗</span>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, letterSpacing: 3 }}>
            <span style={{ color: '#FF6B35' }}>MEET</span>
            <span style={{ color: isLight ? '#111' : '#F0F0F0' }}> MAP</span>
          </div>
        </div>

        {/* Upcoming badge */}
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: '#555', borderLeft: '1px solid #1A1A1A', paddingLeft: 24 }}>
          <span style={{ color: '#FF6B35', fontWeight: 700 }}>{upcomingCount}</span> upcoming events
        </div>

        {/* Search */}
        <div style={{ flex: 1, maxWidth: 360, minWidth: 220, position: 'relative' }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: isLight ? '#444' : '#444' }}>🔍</span>
          <input
            value={search}
            onChange={e => {
              setSearch(e.target.value)
              if (activeCityFilter) setActiveCityFilter('')
            }}
            placeholder="Search events, city, tags..."
            style={{
              width: '100%',
              height: 36,
              background: isLight ? '#FFFFFF' : '#141414',
              border: `1px solid ${isLight ? '#E5E5E5' : '#1E1E1E'}`,
              borderRadius: 10,
              padding: '0 12px 0 36px',
              color: isLight ? '#222' : '#F0F0F0',
              fontSize: 14,
              outline: 'none',
              cursor: 'text',
            }}
          />
        </div>

        {/* Light/Dark toggle */}
        <button
          onClick={toggleTheme}
          style={{
            background: topBtnBg,
            border: `1px solid ${topBtnBorder}`,
            color: topBtnColor,
            borderRadius: navBtnBorderRadius,
            padding: `0 ${navBtnPaddingX}px`,
            height: navBtnHeight,
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 12,
            fontWeight: 800,
            cursor: 'pointer',
            textTransform: 'uppercase',
            letterSpacing: 0.3,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          Light/Dark
        </button>

        <button
          onClick={handleEnableNotifications}
          style={{
            background: topBtnBg,
            border: `1px solid ${topBtnBorder}`,
            color: topBtnColor,
            borderRadius: navBtnBorderRadius,
            padding: `0 ${navBtnPaddingX}px`,
            height: navBtnHeight,
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 12,
            fontWeight: 800,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title="Enable reminders for saved events"
        >
          {notificationPermission === 'granted' ? 'Alerts On' : 'Enable Alerts'}
        </button>

        {/* Imports (flyer queue) */}
        {canAccessImports && (
          <button
            onClick={() => setShowImportQueue(true)}
            style={{
              background: topBtnBg,
              border: `1px solid ${topBtnBorder}`,
              borderRadius: navBtnBorderRadius,
              padding: `0 ${navBtnPaddingX}px`,
              height: navBtnHeight,
              color: topBtnColor,
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 12,
              fontWeight: 800,
              cursor: 'pointer',
              textTransform: 'uppercase',
              letterSpacing: 0.3,
              whiteSpace: 'nowrap',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            Imports
          </button>
        )}

        {/* Moderation (event reports) */}
        {canAccessImports && (
          <button
            onClick={() => setShowModerationQueue(true)}
            style={{
              background: topBtnBg,
              border: `1px solid ${topBtnBorder}`,
              borderRadius: navBtnBorderRadius,
              padding: `0 ${navBtnPaddingX}px`,
              height: navBtnHeight,
              color: topBtnColor,
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 12,
              fontWeight: 800,
              cursor: 'pointer',
              textTransform: 'uppercase',
              letterSpacing: 0.3,
              whiteSpace: 'nowrap',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            Moderation
          </button>
        )}

        {/* Type filters */}
        <div style={{ display: 'flex', gap: 6 }}>
          {/* All Events */}
          <button
            onClick={() => setTypeFilter('all')}
            style={{
              padding: '5px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600,
              textTransform: 'capitalize', letterSpacing: 0.3,
              background: typeFilter === 'all' ? (TYPE_COLORS.all || '#FF6B35') : filterChipBg,
              color: typeFilter === 'all' ? '#0A0A0A' : filterChipText,
              transition: 'all 0.15s',
            }}
          >
            All Events
          </button>

          {/* Near Me (next to All Events) */}
          <button
            onClick={() => {
              if (nearMeOnly) setNearMeOnly(false)
              else requestNearMe()
            }}
            style={{
              padding: '5px 14px', borderRadius: 20, border: '1px solid',
              borderColor: nearMeOnly ? '#FF6B35' : filterChipBorder,
              background: nearMeOnly ? (isLight ? '#FFF3ED' : '#222') : filterChipBg,
              cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600,
              color: nearMeOnly ? (isLight ? '#D1491A' : '#aaa') : filterChipText,
              textTransform: 'uppercase',
              letterSpacing: 0.3,
              transition: 'all 0.15s',
            }}
          >
            {nearMeOnly ? '✓ Near Me' : 'Near Me'}
          </button>

          {['meet', 'car show', 'track day', 'cruise'].map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              style={{
                padding: '5px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
                fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600,
                textTransform: 'capitalize', letterSpacing: 0.3,
                background: typeFilter === t ? (TYPE_COLORS[t] || '#FF6B35') : filterChipBg,
                color: typeFilter === t ? '#0A0A0A' : filterChipText,
                transition: 'all 0.15s',
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {activeCityFilter && (
          <button
            onClick={() => {
              setSearch('')
              setActiveCityFilter('')
            }}
            style={{
              background: isLight ? '#FFF3ED' : '#20140F',
              border: `1px solid ${isLight ? '#F0C3B3' : '#3A241C'}`,
              color: isLight ? '#D1491A' : '#FF8A5C',
              borderRadius: 999,
              padding: '6px 12px',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
            title="Clear city filter"
          >
            City: {activeCityFilter} ×
          </button>
        )}

        {/* Past events toggle */}
        <button
          onClick={() => setShowPast(p => !p)}
          style={{
            padding: '5px 14px', borderRadius: 20, border: '1px solid',
            borderColor: showPast ? '#444' : '#1A1A1A',
            background: showPast ? '#222' : 'transparent',
            color: showPast ? '#aaa' : '#444',
            fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600,
            cursor: 'pointer', transition: 'all 0.15s',
          }}
        >
          {showPast ? '✓ Past Events' : 'Past Events'}
        </button>

        <button
          onClick={() => setShowSavedOnly(p => !p)}
          style={{
            padding: '5px 14px', borderRadius: 20, border: '1px solid',
            borderColor: showSavedOnly ? '#FF6B35' : '#1A1A1A',
            background: showSavedOnly ? '#20140F' : 'transparent',
            color: showSavedOnly ? '#FF8A5C' : '#444',
            fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600,
            cursor: 'pointer', transition: 'all 0.15s',
          }}
        >
          {showSavedOnly ? `★ Saved (${savedEventIds.length})` : 'Saved'}
        </button>
        <button
          onClick={() => setShowCanceled(p => !p)}
          style={{
            padding: '5px 14px', borderRadius: 20, border: '1px solid',
            borderColor: showCanceled ? '#FF6060' : '#1A1A1A',
            background: showCanceled ? '#2A1010' : 'transparent',
            color: showCanceled ? '#FF7A7A' : '#444',
            fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600,
            cursor: 'pointer', transition: 'all 0.15s',
          }}
        >
          {showCanceled ? '✓ Show Canceled' : 'Show Canceled'}
        </button>
        <button
          onClick={() => setShowGoingOnly(p => !p)}
          style={{
            padding: '5px 14px', borderRadius: 20, border: '1px solid',
            borderColor: showGoingOnly ? '#7CFF6B' : '#1A1A1A',
            background: showGoingOnly ? '#0F2412' : 'transparent',
            color: showGoingOnly ? '#9BFF8E' : '#444',
            fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600,
            cursor: 'pointer', transition: 'all 0.15s',
          }}
        >
          {showGoingOnly ? '✓ Going Only' : 'Going Only'}
        </button>

        {/* spacer */}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Auth + Post */}
        {user ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: '#555' }}>
              👤 <span style={{ color: '#888' }}>{user.user_metadata?.username || user.email?.split('@')[0]}</span>
            </div>
            <button
              onClick={() => setShowPost(true)}
              style={{
                background: '#FF6B35', color: '#0A0A0A', border: 'none', borderRadius: 10,
                padding: `0 ${navBtnPaddingX}px`, height: navBtnHeight, fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 16, letterSpacing: 1.5, cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1,
                whiteSpace: 'nowrap',
              }}
            >+ POST EVENT</button>
            <button
              onClick={() => signOut()}
              style={{
                background: topBtnBg,
                border: `1px solid ${topBtnBorder}`,
                borderRadius: navBtnBorderRadius,
                padding: `0 ${navBtnPaddingX}px`,
                height: navBtnHeight,
                color: topBtnColor,
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 12,
                cursor: 'pointer',
                fontWeight: 800,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1,
                whiteSpace: 'nowrap',
              }}
            >
              Sign Out
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => setShowAuth(true)}
              style={{
                background: topBtnBg,
                border: `1px solid ${topBtnBorder}`,
                borderRadius: navBtnBorderRadius,
                padding: `0 ${navBtnPaddingX}px`,
                height: navBtnHeight,
                color: topBtnColor,
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 12,
                cursor: 'pointer',
                fontWeight: 800,
                textTransform: 'capitalize',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1,
                whiteSpace: 'nowrap',
              }}
            >
              Log In
            </button>
            <button
              onClick={() => setShowAuth(true)}
              style={{
                background: '#FF6B35',
                border: 'none',
                borderRadius: navBtnBorderRadius,
                padding: `0 ${navBtnPaddingX}px`,
                height: navBtnHeight,
                color: '#0A0A0A',
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 16,
                letterSpacing: 1.5,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1,
                whiteSpace: 'nowrap',
              }}
            >
              JOIN FREE
            </button>
          </div>
        )}
      </nav>

      {/* MAIN CONTENT — map left, list right */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* MAP — left side, takes remaining space */}
        <div style={{ flex: 1, minWidth: 520, position: 'relative' }}>
          <MapView
            events={eventsForDisplay}
            selectedEvent={selectedEvent}
            hoveredEvent={hoveredEvent}
            onEventClick={handleEventClick}
            centerOn={mapCenter}
          />
        </div>

        {/* EVENT PANEL — right sidebar */}
        <div style={{
          width: 'clamp(420px, 34vw, 560px)', background: isLight ? '#FFFFFF' : '#0D0D0D', borderLeft: `1px solid ${isLight ? '#E5E5E5' : '#1A1A1A'}`,
          display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0,
        }}>
          <EventPanel
            events={eventsForDisplay}
            loading={loading}
            selectedEvent={selectedEvent}
            onEventClick={handleEventClick}
            onHover={setHoveredEvent}
            savedEventIds={savedEventIds}
            onToggleSaved={handleToggleSaved}
          />
          <div style={{
            borderTop: `1px solid ${isLight ? '#E5E5E5' : '#1A1A1A'}`,
            padding: '10px 14px 12px',
            background: isLight ? '#FAFAFA' : '#101010',
          }}>
            <div style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 10,
              letterSpacing: 1.3,
              textTransform: 'uppercase',
              color: isLight ? '#555' : '#8A8A8A',
              marginBottom: 8,
              fontWeight: 700,
            }}>
              Popular Cities
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {CITY_LINKS.map(city => (
                <a
                  key={city.slug}
                  href={`/?city=${encodeURIComponent(city.label)}`}
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 11,
                    color: isLight ? '#D1491A' : '#FF8A5C',
                    textDecoration: 'none',
                    border: `1px solid ${isLight ? '#F0C3B3' : '#3A241C'}`,
                    borderRadius: 999,
                    padding: '3px 9px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Car Meets in {city.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* MODALS */}
      {selectedEvent && (
        <EventDetail
          event={selectedEvent}
          user={user}
          saved={savedEventIds.includes(selectedEvent.id)}
          onToggleSaved={() => handleToggleSaved(selectedEvent.id)}
          onClose={handleCloseEventDetail}
          onAuthNeeded={() => setShowAuth(true)}
          onDeleted={handleEventDeleted}
          onUpdated={handleEventUpdated}
        />
      )}
      {showPost && (
        <PostEventModal
          user={user}
          onClose={() => setShowPost(false)}
          onPosted={handleEventAdded}
        />
      )}
      {showImportQueue && canAccessImports && (
        <ImportQueueModal
          imports={imports}
          loading={importsLoading || importProcessing}
          approvingId={approvingImportId}
          onApprove={handleApproveImport}
          onReject={handleRejectImport}
          onUpdateImport={handleUpdateImport}
          requiresAuth={!user}
          errorMessage={importError}
          showUpload={!!importParams && !!importError && (String(importError).includes('robots.txt') || String(importError).includes('Could not fetch image'))}
          uploading={importUploading}
          onPickUpload={handleUploadFlyer}
          onClose={() => setShowImportQueue(false)}
        />
      )}
      {showModerationQueue && canAccessImports && (
        <ModerationQueueModal
          reports={moderationReports}
          loading={moderationLoading}
          resolvingReportId={moderationResolvingReportId}
          onResolve={handleResolveReport}
          onIgnore={handleIgnoreReport}
          onClose={() => setShowModerationQueue(false)}
        />
      )}
      {showAuth && (
        <AuthModal
          onClose={() => setShowAuth(false)}
          onSuccess={() => setShowAuth(false)}
        />
      )}
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  )
}
