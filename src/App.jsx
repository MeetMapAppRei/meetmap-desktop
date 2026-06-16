import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase, fetchEvents, fetchEventById, fetchEventScheduleByIds, signIn, signUp, signOut, createEvent, fetchFlyerImports, createFlyerImport, updateFlyerImportStatus, updateFlyerImport, uploadFlyerImportImage, fetchSavedEventIds, setSavedEventStatus, upsertSavedEvents, fetchEventStatuses, fetchLatestEventUpdates, fetchEventReports, resolveEventReport, fetchNotificationPreferences, upsertNotificationPreferences } from './lib/supabase'
import { isEventUpcoming } from './lib/eventSchedule'
import { ThemeProvider, useTheme } from './lib/ThemeContext'
import MapView from './components/MapView'
import EventPanel from './components/EventPanel'
import PostEventModal from './components/PostEventModal'
import EventDetail from './components/EventDetail'
import AuthModal from './components/AuthModal'
import NotificationSettingsModal from './components/NotificationSettingsModal'
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  normalizeNotificationPreferences,
  isReminderWindowEnabled,
} from './lib/notificationPreferences'
import ImportQueueModal from './components/ImportQueueModal'
import ModerationQueueModal from './components/ModerationQueueModal'
import PlayStoreBanner from './components/PlayStoreBanner'
import FirstEventNudge from './components/FirstEventNudge'
import HeaderOptionsMenu from './components/HeaderOptionsMenu'
import { geocodeAddress } from './lib/geocode'
import { buildEventLocationQuery } from './lib/eventLocation'

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

const showEventNotification = (title, options, eventId, onOpenEvent) => {
  try {
    const notification = new window.Notification(title, {
      icon: '/og-image.svg',
      ...options,
    })
    if (eventId && typeof onOpenEvent === 'function') {
      notification.onclick = () => {
        try {
          window.focus()
        } catch {}
        onOpenEvent(String(eventId).trim())
        notification.close()
      }
    }
    return notification
  } catch (e) {
    console.error('Failed to show notification:', e)
    return null
  }
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
  const [authInitialMode, setAuthInitialMode] = useState('login')
  const [passwordRecovery, setPasswordRecovery] = useState(false)
  const openAuth = useCallback((mode = 'login') => {
    setAuthInitialMode(mode)
    setShowAuth(true)
  }, [])
  const closeAuth = useCallback(() => {
    setShowAuth(false)
    setAuthInitialMode('login')
    setPasswordRecovery(false)
  }, [])
  const [search, setSearch] = useState('')
  const [activeCityFilter, setActiveCityFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [showPast, setShowPast] = useState(false)
  const [showCanceled, setShowCanceled] = useState(false)
  const [showSavedOnly, setShowSavedOnly] = useState(false)
  const [savedEventIds, setSavedEventIds] = useState([])
  const [savedSyncAvailable, setSavedSyncAvailable] = useState(true)
  const [notificationPermission, setNotificationPermission] = useState(
    typeof window !== 'undefined' && 'Notification' in window ? window.Notification.permission : 'unsupported'
  )
  const [showNotificationSettings, setShowNotificationSettings] = useState(false)
  const [notificationPrefs, setNotificationPrefs] = useState(() => ({
    ...DEFAULT_NOTIFICATION_PREFERENCES,
  }))
  const [notificationPrefsSaving, setNotificationPrefsSaving] = useState(false)
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
  const pendingSharedEventIdRef = useRef(
    (() => {
      try {
        return String(new URLSearchParams(window.location.search).get('event') || '').trim()
      } catch {
        return ''
      }
    })(),
  )
  const [queuedEventId, setQueuedEventId] = useState(() => pendingSharedEventIdRef.current)
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
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user || null)
      if (event === 'PASSWORD_RECOVERY') {
        setPasswordRecovery(true)
        if (typeof window !== 'undefined') {
          const { pathname, search } = window.location
          window.history.replaceState({}, document.title, `${pathname}${search}`)
        }
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!passwordRecovery) return
    openAuth('new-password')
  }, [passwordRecovery, openAuth])

  useEffect(() => {
    if (!user?.id) {
      setNotificationPrefs({ ...DEFAULT_NOTIFICATION_PREFERENCES })
      return
    }
    if (notificationPermission !== 'granted') return

    let cancelled = false
    fetchNotificationPreferences(user.id)
      .then((row) => {
        if (cancelled) return
        if (row) {
          setNotificationPrefs(normalizeNotificationPreferences(row))
          return
        }
        return upsertNotificationPreferences(user.id, {}).then((created) => {
          if (!cancelled && created) {
            setNotificationPrefs(normalizeNotificationPreferences(created))
          }
        })
      })
      .catch((error) => {
        console.error('Failed to load notification preferences:', error)
      })
    return () => {
      cancelled = true
    }
  }, [user, notificationPermission])

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

  const openEventById = useCallback(
    async (rawEventId) => {
      const eventId = String(rawEventId || '').trim()
      if (!eventId) return
      const inList = events.find(e => e.id === eventId)
      const open = (event) => {
        setSelectedEvent(event)
        if (event.lat && event.lng) setMapCenter({ lat: event.lat, lng: event.lng })
      }
      if (inList) {
        open(inList)
        return
      }
      try {
        const event = await fetchEventById(eventId)
        if (!event) return
        setEvents(prev => (prev.some(e => e.id === event.id) ? prev : [event, ...prev]))
        open(event)
      } catch (e) {
        console.error('Failed to open event:', e)
      }
    },
    [events],
  )

  // Allow homepage city links to open the app with a prefilled city search.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const cityParam = (params.get('city') || '').trim()
    if (!cityParam) return
    setSearch(cityParam)
    setActiveCityFilter(cityParam)
    const next = new URL(window.location.href)
    next.searchParams.delete('city')
    window.history.replaceState({}, '', `${next.pathname}${next.search}`)
  }, [])

  // Shared links and notification deep links (?event=uuid)
  useEffect(() => {
    const eventId = String(queuedEventId || '').trim()
    if (!eventId) return
    setQueuedEventId('')
    pendingSharedEventIdRef.current = ''
    void openEventById(eventId)
    try {
      const next = new URL(window.location.href)
      next.searchParams.delete('event')
      window.history.replaceState({}, '', `${next.pathname}${next.search}`)
    } catch {}
  }, [openEventById, queuedEventId])

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
      if (permission === 'granted') {
        if (user?.id) await upsertNotificationPreferences(user.id, {})
        setShowNotificationSettings(true)
      }
    } catch (e) {
      console.error('Notification permission request failed:', e)
    }
  }

  const handleNotificationPrefChange = async (patch) => {
    const next = { ...notificationPrefs, ...patch }
    setNotificationPrefs(next)
    if (!user?.id) return
    setNotificationPrefsSaving(true)
    try {
      const saved = await upsertNotificationPreferences(user.id, next)
      if (saved) setNotificationPrefs(normalizeNotificationPreferences(saved))
    } catch (error) {
      console.error('Failed to save notification preferences:', error)
      try {
        const row = await fetchNotificationPreferences(user.id)
        if (row) setNotificationPrefs(normalizeNotificationPreferences(row))
      } catch {}
    } finally {
      setNotificationPrefsSaving(false)
    }
  }

  const handleAlertsClick = async () => {
    if (notificationPermission !== 'granted') {
      await handleEnableNotifications()
      return
    }
    setShowNotificationSettings(true)
  }

  const alertsEnabled = notificationPermission === 'granted'

  const toRad = (deg) => (deg * Math.PI) / 180
  const distanceMiles = (lat1, lon1, lat2, lon2) => {
    const R = 3958.8 // Earth radius in miles
    const dLat = toRad(lat2 - lat1)
    const dLon = toRad(lon2 - lon1)
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
  }

  const baseEvents = showSavedOnly
    ? filtered.filter(e => savedEventIds.includes(e.id))
    : filtered

  const statusFilteredEvents = showCanceled
    ? baseEvents
    : baseEvents.filter(e => String(e.status || 'active').toLowerCase() !== 'canceled')

  const eventsForDisplay = nearMeOnly && nearMeCoords
    ? statusFilteredEvents
      .filter(e => Number.isFinite(e.lat) && Number.isFinite(e.lng) && distanceMiles(nearMeCoords.lat, nearMeCoords.lng, e.lat, e.lng) <= RADIUS_MILES)
      .sort((a, b) => {
        const aStart = eventStartMs(a) ?? Number.POSITIVE_INFINITY
        const bStart = eventStartMs(b) ?? Number.POSITIVE_INFINITY
        if (aStart !== bStart) return aStart - bStart
        // Tie-breaker: keep closer events first when start time matches.
        return distanceMiles(nearMeCoords.lat, nearMeCoords.lng, a.lat, a.lng) -
          distanceMiles(nearMeCoords.lat, nearMeCoords.lng, b.lat, b.lng)
      })
    : statusFilteredEvents

  const upcomingCount = eventsForDisplay.filter(e => e.date >= new Date().toISOString().split('T')[0]).length

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    if (notificationPermission !== 'granted') return
    if (!notificationPrefs.reminders_enabled) return
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
        if (!isReminderWindowEnabled(notificationPrefs, w.id)) continue
        if (eventLog[w.id]) continue
        const reminderMs = startMs - w.leadMs
        if (now >= reminderMs && now <= reminderMs + w.windowMs) {
          try {
            const when = new Date(startMs).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
            const place = event.address || `${event.location || ''}${event.city ? `, ${event.city}` : ''}`.trim()
            showEventNotification(
              `Upcoming saved event: ${event.title}`,
              { body: `${when}${place ? ` • ${place}` : ''}` },
              event.id,
              setQueuedEventId,
            )
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
  }, [notificationPermission, notificationPrefs, savedEventIds, events, user])

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    if (notificationPermission !== 'granted') return
    if (!notificationPrefs.event_updates_enabled) return
    if (!savedEventIds.length) return

    const snapshotKey = getUpdateSnapshotStorageKey(user)
    const notifiedKey = getUpdateNotifiedStorageKey(user)

    const checkUpdateChanges = async () => {
      try {
        const [updateMap, scheduleMap] = await Promise.all([
          fetchLatestEventUpdates(savedEventIds),
          fetchEventScheduleByIds(savedEventIds),
        ])
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
          const schedule = scheduleMap[eventId]
          const upcoming = schedule && isEventUpcoming(schedule)

          if (
            upcoming &&
            hasBaseline &&
            signature &&
            previous !== signature &&
            nextNotified[eventId] !== signature
          ) {
            const eventTitle =
              events.find(e => e.id === eventId)?.title || schedule?.title || 'Saved event'
            showEventNotification(
              `New host update: ${eventTitle}`,
              { body: row.latest_update_message || 'The host posted a new update.' },
              eventId,
              setQueuedEventId,
            )
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
  }, [notificationPermission, notificationPrefs, savedEventIds, events, user])

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    if (notificationPermission !== 'granted') return
    if (!notificationPrefs.event_updates_enabled) return
    if (!savedEventIds.length) return

    const snapshotKey = getStatusSnapshotStorageKey(user)
    const notifiedKey = getStatusNotifiedStorageKey(user)

    const checkStatusChanges = async () => {
      try {
        const [statusMap, scheduleMap] = await Promise.all([
          fetchEventStatuses(savedEventIds),
          fetchEventScheduleByIds(savedEventIds),
        ])
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
          const schedule = scheduleMap[eventId]
          const upcoming = schedule && isEventUpcoming(schedule)

          if (
            upcoming &&
            hasBaseline &&
            previous &&
            previous.signature !== signature &&
            nextNotified[eventId] !== signature
          ) {
            const eventTitle =
              events.find(e => e.id === eventId)?.title || schedule?.title || 'Saved event'
            const label = status === 'canceled'
              ? 'Canceled'
              : status === 'moved'
                ? 'Moved'
                : status === 'delayed'
                  ? 'Delayed'
                  : 'Updated'
            showEventNotification(
              `Status changed: ${eventTitle}`,
              { body: note ? `${label} • ${note}` : label },
              eventId,
              setQueuedEventId,
            )
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
  }, [notificationPermission, notificationPrefs, savedEventIds, events, user])

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
      const query = buildEventLocationQuery(imp)
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
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: isLight ? '#F6F6F6' : '#0A0A0A',
        overflow: 'hidden',
        paddingTop: 'var(--meetmap-play-promo-top, 0px)',
      }}
    >

      {/* TOP NAV — left brand, scrollable filters, pinned auth/post */}
      <nav style={{
        height: 58, background: isLight ? '#FFFFFF' : '#0D0D0D', borderBottom: `1px solid ${isLight ? '#E5E5E5' : '#1A1A1A'}`,
        display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12,
        flexShrink: 0, position: 'relative', zIndex: 1000, minWidth: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
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
        </div>

        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexWrap: 'nowrap',
          }}
        >
        {/* Type filters */}
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {/* All Events */}
          <button
            onClick={() => setTypeFilter('all')}
            style={{
              padding: '5px 10px', borderRadius: 20, border: 'none', cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600,
              textTransform: 'capitalize', letterSpacing: 0.3,
              background: typeFilter === 'all' ? (TYPE_COLORS.all || '#FF6B35') : filterChipBg,
              color: typeFilter === 'all' ? '#0A0A0A' : filterChipText,
              transition: 'all 0.15s',
              flexShrink: 0,
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
              padding: '5px 10px', borderRadius: 20, border: '1px solid',
              borderColor: nearMeOnly ? '#FF6B35' : filterChipBorder,
              background: nearMeOnly ? (isLight ? '#FFF3ED' : '#222') : filterChipBg,
              cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600,
              color: nearMeOnly ? (isLight ? '#D1491A' : '#aaa') : filterChipText,
              textTransform: 'uppercase',
              letterSpacing: 0.3,
              transition: 'all 0.15s',
              flexShrink: 0,
            }}
          >
            {nearMeOnly ? '✓ Near Me' : 'Near Me'}
          </button>

          {['meet', 'car show', 'track day', 'cruise'].map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              style={{
                padding: '5px 10px', borderRadius: 20, border: 'none', cursor: 'pointer',
                fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600,
                textTransform: 'capitalize', letterSpacing: 0.3,
                background: typeFilter === t ? (TYPE_COLORS[t] || '#FF6B35') : filterChipBg,
                color: typeFilter === t ? '#0A0A0A' : filterChipText,
                transition: 'all 0.15s',
                flexShrink: 0,
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

        </div>

        {/* Options + auth/post — always visible on the right */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: 4 }}>
        <HeaderOptionsMenu
          isLight={isLight}
          onToggleTheme={toggleTheme}
          alertsEnabled={alertsEnabled}
          onAlertsClick={handleAlertsClick}
          showPast={showPast}
          onTogglePast={() => setShowPast((p) => !p)}
          showSavedOnly={showSavedOnly}
          onToggleSavedOnly={() => setShowSavedOnly((p) => !p)}
          savedCount={savedEventIds.length}
          showCanceled={showCanceled}
          onToggleCanceled={() => setShowCanceled((p) => !p)}
          canAccessImports={canAccessImports}
          pendingImportsCount={imports.length}
          onOpenImports={() => setShowImportQueue(true)}
          onOpenModeration={() => setShowModerationQueue(true)}
          topBtnBg={topBtnBg}
          topBtnBorder={topBtnBorder}
          topBtnColor={topBtnColor}
          navBtnHeight={navBtnHeight}
          navBtnPaddingX={navBtnPaddingX}
          navBtnBorderRadius={navBtnBorderRadius}
        />
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => setShowAuth(true)}
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
              Join Free
            </button>
          </div>
        )}
        </div>
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
          <div style={{ padding: '12px 14px 0' }}>
            <FirstEventNudge userId={user?.id} onPost={() => (user ? setShowPost(true) : setShowAuth(true))} />
          </div>
          <EventPanel
            events={eventsForDisplay}
            loading={loading}
            selectedEvent={selectedEvent}
            onEventClick={handleEventClick}
            onHover={setHoveredEvent}
            savedEventIds={savedEventIds}
            onToggleSaved={handleToggleSaved}
          />
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
          initialMode={authInitialMode}
          onClose={closeAuth}
          onSuccess={closeAuth}
        />
      )}
      {showNotificationSettings && (
        <NotificationSettingsModal
          onClose={() => setShowNotificationSettings(false)}
          alertsEnabled={alertsEnabled}
          prefs={notificationPrefs}
          saving={notificationPrefsSaving}
          canSyncPrefs={Boolean(user?.id)}
          onPrefChange={handleNotificationPrefChange}
          onRequestEnable={handleEnableNotifications}
          onRequestLogin={() => {
            setShowNotificationSettings(false)
            setShowAuth(true)
          }}
        />
      )}
      <PlayStoreBanner />
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
