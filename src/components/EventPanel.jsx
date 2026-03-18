const TYPE_COLORS = { meet: '#FF6B35', 'car show': '#FFD700', 'track day': '#00D4FF', cruise: '#7CFF6B' }

export default function EventPanel({ events, loading, selectedEvent, onEventClick, onHover }) {
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

    return (
      <div
        onClick={() => onEventClick(event)}
        onMouseEnter={() => onHover(event)}
        onMouseLeave={() => onHover(null)}
        style={{
          padding: '14px 16px', cursor: 'pointer', borderBottom: '1px solid #141414',
          background: isSelected ? '#141414' : 'transparent',
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
              ? <img src={event.photo_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
              : <span style={{ fontSize: 28 }}>{event.type === 'meet' ? '🚗' : event.type === 'car show' ? '🏆' : event.type === 'track day' ? '🏁' : '🛣️'}</span>
            }
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Type badge */}
            <span style={{
              fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 700,
              color, textTransform: 'capitalize', letterSpacing: 0.5,
            }}>{event.type}</span>

            {/* Title */}
            <div style={{
              fontFamily: "'Bebas Neue', sans-serif", fontSize: 17, letterSpacing: 1,
              lineHeight: 1.1, marginTop: 2, marginBottom: 4,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{event.title}</div>

            {/* Location */}
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: '#555', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              📍 {event.address || `${event.location} · ${event.city}`}
            </div>

            {/* Date + attendees */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color, fontWeight: 600 }}>
                {formatDate(event.date)}{event.time ? ` · ${event.time}` : ''}
              </span>
              {attendeeCount > 0 && (
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: '#444' }}>
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
    <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: '#1A1A1A #0D0D0D' }}>
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
              <div style={{ padding: '12px 16px 8px', fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 700, color: '#333', letterSpacing: 2, textTransform: 'uppercase', borderBottom: '1px solid #141414' }}>
                Upcoming · {upcoming.length}
              </div>
              {upcoming.map(e => <EventCard key={e.id} event={e} />)}
            </>
          )}
          {past.length > 0 && (
            <>
              <div style={{ padding: '12px 16px 8px', fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 700, color: '#333', letterSpacing: 2, textTransform: 'uppercase', borderBottom: '1px solid #141414' }}>
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
