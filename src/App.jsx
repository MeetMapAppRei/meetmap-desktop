import { useState, useEffect } from 'react'
import { supabase, fetchEvents, signIn, signUp, signOut, createEvent, fetchFlyerImports, createFlyerImport, updateFlyerImportStatus, updateFlyerImport, uploadFlyerImportImage } from './lib/supabase'
import { ThemeProvider, useTheme } from './lib/ThemeContext'
import MapView from './components/MapView'
import EventPanel from './components/EventPanel'
import PostEventModal from './components/PostEventModal'
import EventDetail from './components/EventDetail'
import AuthModal from './components/AuthModal'
import ImportQueueModal from './components/ImportQueueModal'

const TYPE_COLORS = { meet: '#FF6B35', 'car show': '#FFD700', 'track day': '#00D4FF', cruise: '#7CFF6B' }

function AppInner() {
  // Redirect mobile users to the mobile app (only if not already on the mobile site)
  useEffect(() => {
    const isMobile = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent)
    const isMobileSite = window.location.hostname === 'meetmap-gilt.vercel.app'
    if (isMobile && !isMobileSite) {
      window.location.href = 'https://meetmap-gilt.vercel.app'
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
  const [typeFilter, setTypeFilter] = useState('all')
  const [showPast, setShowPast] = useState(false)
  const [loading, setLoading] = useState(true)
  const [mapCenter, setMapCenter] = useState(null)

  const RADIUS_MILES = 25
  const [nearMeOnly, setNearMeOnly] = useState(false)
  const [nearMeCoords, setNearMeCoords] = useState(null)
  const [nearMeError, setNearMeError] = useState('')

  const [showImportQueue, setShowImportQueue] = useState(false)
  const [imports, setImports] = useState([])
  const [importsLoading, setImportsLoading] = useState(false)
  const [approvingImportId, setApprovingImportId] = useState(null)
  const [importProcessing, setImportProcessing] = useState(false)
  const [importParams, setImportParams] = useState(null) // { sourceUrl, imageUrl }
  const [importError, setImportError] = useState(null)
  const [importUploading, setImportUploading] = useState(false)

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
      e.title.toLowerCase().includes(search.toLowerCase()) ||
      e.city.toLowerCase().includes(search.toLowerCase()) ||
      (e.tags || []).some(t => t.toLowerCase().includes(search.toLowerCase()))
    )
    setFiltered(result)
  }, [events, search, typeFilter])

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

  const eventsForDisplay = nearMeOnly && nearMeCoords
    ? filtered
      .filter(e => Number.isFinite(e.lat) && Number.isFinite(e.lng) && distanceMiles(nearMeCoords.lat, nearMeCoords.lng, e.lat, e.lng) <= RADIUS_MILES)
      .sort((a, b) => (
        distanceMiles(nearMeCoords.lat, nearMeCoords.lng, a.lat, a.lng) -
        distanceMiles(nearMeCoords.lat, nearMeCoords.lng, b.lat, b.lng)
      ))
    : filtered

  const upcomingCount = eventsForDisplay.filter(e => e.date >= new Date().toISOString().split('T')[0]).length

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
    if (!user) return
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
    if (!user) setShowAuth(true)
  }, [importParams, user])

  useEffect(() => {
    if (!showImportQueue) return
    if (!user) return
    loadPendingImports()
  }, [showImportQueue, user])

  useEffect(() => {
    if (!importParams) return
    if (!user) return
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
  }, [importParams, user, showImportQueue])

  const handleUploadFlyer = async (file) => {
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
    if (!user || !imp) return
    setApprovingImportId(imp.id)
    try {
      const required = ['title', 'type', 'date', 'location', 'city']
      const ready = required.every(k => typeof imp?.[k] === 'string' ? imp[k].trim().length > 0 : !!imp?.[k])
      if (!ready) return

      let coords = null
      const query = imp.address?.trim() ? imp.address : `${imp.location || ''}, ${imp.city || ''}`.trim()
      if (query) coords = await geocodeAddress(query).catch(() => null)

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
    } finally {
      setApprovingImportId(null)
    }
  }

  const handleRejectImport = async (imp) => {
    if (!user || !imp) return
    try {
      await updateFlyerImportStatus(imp.id, 'rejected')
      await loadPendingImports()
    } catch (e) {
      console.error('Reject failed:', e)
    }
  }

  const handleUpdateImport = async (importId, nextDraft) => {
    if (!user || !importId || !nextDraft) return
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
        display: 'flex', alignItems: 'center', padding: '0 24px', gap: 24,
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
        <div style={{ flex: 1, maxWidth: 360, position: 'relative' }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: isLight ? '#444' : '#444' }}>🔍</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search events, city, tags..."
            style={{
              width: '100%', background: isLight ? '#FFFFFF' : '#141414', border: `1px solid ${isLight ? '#E5E5E5' : '#1E1E1E'}`,
              borderRadius: 8, padding: '8px 12px 8px 34px', color: isLight ? '#222' : '#F0F0F0',
              fontSize: 13, outline: 'none',
            }}
          />
        </div>

        {/* Light/Dark toggle */}
        <button
          onClick={toggleTheme}
          style={{
            background: isLight ? '#FFFFFF' : 'none',
            border: `1px solid ${isLight ? '#E5E5E5' : '#1E1E1E'}`,
            color: isLight ? '#444' : '#555',
            borderRadius: 10,
            padding: '8px 12px',
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 12,
            fontWeight: 800,
            cursor: 'pointer',
            textTransform: 'uppercase',
            letterSpacing: 0.3,
          }}
        >
          {isLight ? 'Light' : 'Dark'}
        </button>

        {/* Imports (flyer queue) */}
        <button
          onClick={() => {
            if (user) setShowImportQueue(true)
            else setShowAuth(true)
          }}
          style={{
            background: isLight ? '#FFFFFF' : 'none',
            border: `1px solid ${isLight ? '#E5E5E5' : '#1E1E1E'}`,
            borderRadius: 10,
            padding: '8px 12px',
            color: isLight ? '#444' : '#555',
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 12,
            fontWeight: 900,
            cursor: 'pointer',
            textTransform: 'uppercase',
            letterSpacing: 0.3,
            whiteSpace: 'nowrap',
          }}
        >
          Imports
        </button>

        {/* Type filters */}
        <div style={{ display: 'flex', gap: 6 }}>
          {/* All Events */}
          <button
            onClick={() => setTypeFilter('all')}
            style={{
              padding: '5px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600,
              textTransform: 'capitalize', letterSpacing: 0.3,
              background: typeFilter === 'all' ? (TYPE_COLORS.all || '#FF6B35') : '#141414',
              color: typeFilter === 'all' ? '#0A0A0A' : '#555',
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
              borderColor: nearMeOnly ? '#FF6B35' : '#1E1E1E',
              background: nearMeOnly ? '#222' : '#141414',
              cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600,
              color: nearMeOnly ? '#aaa' : '#555',
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
                background: typeFilter === t ? (TYPE_COLORS[t] || '#FF6B35') : '#141414',
                color: typeFilter === t ? '#0A0A0A' : '#555',
                transition: 'all 0.15s',
              }}
            >
              {t}
            </button>
          ))}
        </div>

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

        {/* spacer */}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Auth + Post */}
        {user ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: '#555' }}>
              👤 <span style={{ color: '#888' }}>{user.user_metadata?.username || user.email?.split('@')[0]}</span>
            </div>
            <button
              onClick={() => setShowPost(true)}
              style={{
                background: '#FF6B35', color: '#0A0A0A', border: 'none', borderRadius: 8,
                padding: '8px 18px', fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 16, letterSpacing: 1.5, cursor: 'pointer',
              }}
            >+ POST EVENT</button>
            <button onClick={() => signOut()} style={{ background: 'none', border: '1px solid #222', borderRadius: 8, padding: '7px 14px', color: '#555', fontSize: 12, cursor: 'pointer' }}>Sign Out</button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setShowAuth(true)} style={{ background: 'none', border: '1px solid #222', borderRadius: 8, padding: '7px 16px', color: '#888', fontSize: 13, cursor: 'pointer' }}>Log In</button>
            <button onClick={() => setShowAuth(true)} style={{ background: '#FF6B35', border: 'none', borderRadius: 8, padding: '8px 18px', color: '#0A0A0A', fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, letterSpacing: 1.5, cursor: 'pointer' }}>JOIN FREE</button>
          </div>
        )}
      </nav>

      {/* MAIN CONTENT — map left, list right */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* MAP — left side, takes remaining space */}
        <div style={{ flex: 1, position: 'relative' }}>
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
          width: 380, background: isLight ? '#FFFFFF' : '#0D0D0D', borderLeft: `1px solid ${isLight ? '#E5E5E5' : '#1A1A1A'}`,
          display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0,
        }}>
          <EventPanel
            events={eventsForDisplay}
            loading={loading}
            selectedEvent={selectedEvent}
            onEventClick={handleEventClick}
            onHover={setHoveredEvent}
          />
        </div>
      </div>

      {/* MODALS */}
      {selectedEvent && (
        <EventDetail
          event={selectedEvent}
          user={user}
          onClose={() => setSelectedEvent(null)}
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
      {showImportQueue && (
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
