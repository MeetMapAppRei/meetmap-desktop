import { useTheme } from '../lib/ThemeContext'

const TYPE_COLORS = { meet: '#FF6B35', 'car show': '#FFD700', 'track day': '#00D4FF', cruise: '#7CFF6B' }

export default function EventPanel({ events, loading, selectedEvent, onEventClick, onHover, savedEventIds = [], onToggleSaved }) {
  const { isLight } = useTheme()
  const today = new Date().toISOString().split('T')[0]
  const upcoming = events.filter(e => e.date >= today)
  const past = events.filter(e => e.date < today)

  const formatDate = (d) => {
    const date = new Date(d + 'T00:00:00')
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  }

  const EventCard = ({ event }) => {
    const color = TYPE_COLORS[event.type] || '#FF6B35'
    const isSelected = selectedEvent?.id === event.id
    const isPast = event.date < today
    const attendeeCount = event.event_attendees?.[0]?.count || 0
    const isSaved = savedEventIds.includes(event.id)

    return (
      <div
        onClick={() => onEventClick(event)}
        onMouseEnter={() => onHover(event)}
        onMouseLeave={() => onHover(null)}
        style={{
          padding: '14px 16px', cursor: 'pointer', borderBottom: `1px solid ${isLight ? '#E5E5E5' : '#141414'}`,
          background: isSelected ? (isLight ? '#F2F2F2' : '#141414') : 'transparent',
          borderLeft: isSelected ? `3px solid ${color}` : '3px solid transparent',
          transition: 'all 0.15s', opacity: isPast ? 0.5 : 1,
        }}
      >
        <div style={{ display: 'flex', gap: 12 }}>
          {/* Photo or color block */}
          <div style={{
            width: 72, height: 72, borderRadius: 8, flexShrink: 0, overflow: 'hidden',
            background: color + '22', border: `1px solid ${color}33`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {event.photo_url
              ? <img
                  src={event.photo_url}
                  loading="lazy"
                  decoding="async"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  alt=""
                />
              : <span style={{ fontSize: 28 }}>{event.type === 'meet' ? '🚗' : event.type === 'car show' ? '🏆' : event.type === 'track day' ? '🏁' : '🛣️'}</span>
            }
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Type badge */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span style={{
                fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 700,
                color, textTransform: 'capitalize', letterSpacing: 0.5,
              }}>{event.type}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleSaved?.(event.id)
                }}
                style={{
                  border: `1px solid ${isSaved ? '#FF6B35' : (isLight ? '#D9D9D9' : '#2A2A2A')}`,
                  background: isSaved ? '#27140F' : 'transparent',
                  color: isSaved ? '#FF8A5C' : (isLight ? '#666' : '#888'),
                  borderRadius: 999,
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 10,
                  padding: '2px 7px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {isSaved ? '★ Saved' : '☆ Save'}
              </button>
            </div>

            {/* Title */}
            <div style={{
              fontFamily: "'Bebas Neue', sans-serif", fontSize: 17, letterSpacing: 1,
              lineHeight: 1.1, marginTop: 2, marginBottom: 4,
              color: isLight ? '#1A1A1A' : '#F0F0F0',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{event.title}</div>

            {/* Location */}
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: isLight ? '#2C2C2C' : '#B8B8B8', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              📍 {event.address || `${event.location} · ${event.city}`}
            </div>

            {/* Date + attendees */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: isLight ? '#D1491A' : color, fontWeight: 700 }}>
                {formatDate(event.date)}{event.time ? ` · ${event.time}` : ''}
              </span>
              {attendeeCount > 0 && (
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: isLight ? '#2C2C2C' : '#B8B8B8' }}>
                  {attendeeCount} going
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#333', fontFamily: "'Bebas Neue'", fontSize: 20, letterSpacing: 2 }}>LOADING...</div>
    </div>
  )

  return (
    <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: isLight ? '#E5E5E5 #FFFFFF' : '#1A1A1A #0D0D0D' }}>
      {events.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🚗</div>
          <div style={{ fontFamily: "'Bebas Neue'", fontSize: 22, color: '#333', letterSpacing: 2 }}>NO EVENTS FOUND</div>
          <div style={{ fontFamily: "'DM Sans'", fontSize: 13, color: '#333', marginTop: 8 }}>Be the first to post a meet!</div>
        </div>
      ) : (
        <>
          {upcoming.length > 0 && (
            <>
              <div style={{ padding: '12px 16px 8px', fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 700, color: isLight ? '#1F1F1F' : '#AFAFAF', letterSpacing: 2, textTransform: 'uppercase', borderBottom: `1px solid ${isLight ? '#E5E5E5' : '#141414'}` }}>
                Upcoming · {upcoming.length}
              </div>
              {upcoming.map(e => <EventCard key={e.id} event={e} />)}
            </>
          )}
          {past.length > 0 && (
            <>
              <div style={{ padding: '12px 16px 8px', fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 700, color: isLight ? '#1F1F1F' : '#AFAFAF', letterSpacing: 2, textTransform: 'uppercase', borderBottom: `1px solid ${isLight ? '#E5E5E5' : '#141414'}` }}>
                Past · {past.length}
              </div>
              {past.map(e => <EventCard key={e.id} event={e} />)}
            </>
          )}
        </>
      )}
    </div>
  )
}
