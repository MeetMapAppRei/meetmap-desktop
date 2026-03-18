import { useState, useEffect } from 'react'
import { supabase, fetchEvents, signIn, signUp, signOut } from './lib/supabase'
import MapView from './components/MapView'
import EventPanel from './components/EventPanel'
import PostEventModal from './components/PostEventModal'
import EventDetail from './components/EventDetail'
import AuthModal from './components/AuthModal'

const TYPE_COLORS = { meet: '#FF6B35', 'car show': '#FFD700', 'track day': '#00D4FF', cruise: '#7CFF6B' }

export default function App() {
  // Redirect mobile users to the mobile app (only if not already on the mobile site)
  useEffect(() => {
    const isMobile = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent)
    const isMobileSite = window.location.hostname === 'meetmap-gilt.vercel.app'
    if (isMobile && !isMobileSite) {
      window.location.href = 'https://meetmap-gilt.vercel.app'
    }
  }, [])

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0A0A0A', overflow: 'hidden' }}>

      {/* TOP NAV */}
      <nav style={{
        height: 58, background: '#0D0D0D', borderBottom: '1px solid #1A1A1A',
        display: 'flex', alignItems: 'center', padding: '0 24px', gap: 24,
        flexShrink: 0, zIndex: 100,
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 8 }}>
          <span style={{ fontSize: 22 }}>🚗</span>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, letterSpacing: 3 }}>
            <span style={{ color: '#FF6B35' }}>MEET</span>
            <span style={{ color: '#F0F0F0' }}> MAP</span>
          </div>
        </div>

        {/* Upcoming badge */}
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: '#555', borderLeft: '1px solid #1A1A1A', paddingLeft: 24 }}>
          <span style={{ color: '#FF6B35', fontWeight: 700 }}>{upcomingCount}</span> upcoming events
        </div>

        {/* Search */}
        <div style={{ flex: 1, maxWidth: 360, position: 'relative' }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: '#444' }}>🔍</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search events, city, tags..."
            style={{
              width: '100%', background: '#141414', border: '1px solid #1E1E1E',
              borderRadius: 8, padding: '8px 12px 8px 34px', color: '#F0F0F0',
              fontSize: 13, outline: 'none',
            }}
          />
        </div>

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
          width: 380, background: '#0D0D0D', borderLeft: '1px solid #1A1A1A',
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
      {showAuth && (
        <AuthModal
          onClose={() => setShowAuth(false)}
          onSuccess={() => setShowAuth(false)}
        />
      )}
    </div>
  )
}
