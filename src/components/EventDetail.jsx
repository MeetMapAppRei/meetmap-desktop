import { useState, useEffect, useRef } from 'react'
import { supabase, fetchComments, postComment, getEventRsvpStatus, setEventRsvp, updateEvent, uploadEventPhoto, createEventUpdate } from '../lib/supabase'
import { useTheme } from '../lib/ThemeContext'
import { getEventQuality } from '../lib/eventQuality'

const TYPE_COLORS = { meet: '#FF6B35', 'car show': '#FFD700', 'track day': '#00D4FF', cruise: '#7CFF6B' }
const STATUS_META = {
  active: { label: 'Active', fg: '#7CFF6B', bg: '#7CFF6B22' },
  moved: { label: 'Moved', fg: '#00D4FF', bg: '#00D4FF22' },
  delayed: { label: 'Delayed', fg: '#FFD700', bg: '#FFD70022' },
  canceled: { label: 'Canceled', fg: '#FF6060', bg: '#FF353522' },
}
const getDirectionsUrl = (event) => {
  const query = (event?.address || `${event?.location || ''}, ${event?.city || ''}`).trim()
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

const inp = {
  width: '100%', background: '#141414', border: '1px solid #1E1E1E',
  borderRadius: 8, padding: '10px 13px', color: '#F0F0F0',
  fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: 'none',
  marginBottom: 12, colorScheme: 'dark',
}
const lbl = {
  fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: '#555',
  letterSpacing: 1, display: 'block', marginBottom: 4, textTransform: 'uppercase',
}

async function geocodeAddress(address) {
  const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`)
  const data = await res.json()
  if (!data.length) return null
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
}

function EditModal({ event, user, onSaved, onCancel }) {
  const fileRef = useRef()
  const [form, setForm] = useState({
    title: event.title || '',
    type: event.type || 'meet',
    date: event.date || '',
    time: event.time || '',
    location: event.location || '',
    city: event.city || '',
    address: event.address || '',
    description: event.description || '',
    tags: (event.tags || []).join(', '),
    host: event.host || '',
    status: event.status || 'active',
    status_note: event.status_note || '',
  })
  const [photo, setPhoto] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(event.photo_url || null)
  const [coords, setCoords] = useState(event.lat && event.lng ? { lat: event.lat, lng: event.lng } : null)
  const [geocoding, setGeocoding] = useState(false)
  const [addressStatus, setAddressStatus] = useState(event.lat ? 'found' : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleAddressBlur = async () => {
    if (!form.address.trim()) return
    setGeocoding(true); setAddressStatus(''); setCoords(null)
    const result = await geocodeAddress(form.address).catch(() => null)
    setCoords(result)
    setAddressStatus(result ? 'found' : 'notfound')
    setGeocoding(false)
  }

  const handleSave = async () => {
    if (!form.title || !form.date || !form.location || !form.city) {
      setError('Please fill in all required fields.')
      return
    }
    setError(''); setSaving(true)
    try {
      let finalCoords = coords
      if (form.address && !finalCoords) finalCoords = await geocodeAddress(form.address).catch(() => null)
      const tags = form.tags.split(',').map(t => t.trim()).filter(Boolean)
      const updates = {
        title: form.title, type: form.type, date: form.date, time: form.time,
        location: form.location, city: form.city, address: form.address,
        description: form.description, tags, host: form.host,
        status: form.status,
        status_note: form.status_note,
        lat: finalCoords?.lat || null, lng: finalCoords?.lng || null,
      }
      if (photo) {
        const photoUrl = await uploadEventPhoto(photo, event.id)
        updates.photo_url = photoUrl
      }
      const updated = await updateEvent(event.id, updates)
      onSaved(updated)
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div onClick={e => e.target === e.currentTarget && onCancel()} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 560, background: '#0F0F0F', borderRadius: 16, border: '1px solid #1A1A1A', overflow: 'hidden', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ padding: '24px 28px 32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
            <div style={{ fontFamily: "'Bebas Neue'", fontSize: 26, letterSpacing: 2, color: '#FF6B35' }}>EDIT EVENT</div>
            <button onClick={onCancel} style={{ background: 'none', border: 'none', color: '#555', fontSize: 24, cursor: 'pointer' }}>×</button>
          </div>

          {error && <div style={{ background: '#1A0A0A', border: '1px solid #FF353544', borderRadius: 8, padding: '10px 14px', marginBottom: 14, color: '#FF6060', fontFamily: "'DM Sans'", fontSize: 13 }}>{error}</div>}

          {/* Photo */}
          <label style={lbl}>Event Photo</label>
          <div onClick={() => fileRef.current.click()} style={{ border: '2px dashed #1E1E1E', borderRadius: 10, marginBottom: 14, height: photoPreview ? 160 : 80, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: '#111' }}>
            {photoPreview
              ? <img src={photoPreview} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="preview" />
              : <div style={{ textAlign: 'center' }}><div style={{ fontSize: 24 }}>📸</div><div style={{ fontFamily: "'DM Sans'", fontSize: 11, color: '#444' }}>Click to change photo</div></div>}
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={e => { const f = e.target.files[0]; if (f) { setPhoto(f); setPhotoPreview(URL.createObjectURL(f)) } }} style={{ display: 'none' }} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
            <div>
              <label style={lbl}>Event Type</label>
              <select style={{ ...inp, appearance: 'none' }} value={form.type} onChange={e => set('type', e.target.value)}>
                <option value="meet">Meet</option>
                <option value="car show">Car Show</option>
                <option value="track day">Track Day</option>
                <option value="cruise">Cruise</option>
              </select>

              <label style={lbl}>Event Name *</label>
              <input style={inp} value={form.title} onChange={e => set('title', e.target.value)} placeholder="Sunday Funday Car Meet" />

              <label style={lbl}>Hosted By</label>
              <input style={inp} value={form.host} onChange={e => set('host', e.target.value)} placeholder="Your crew or org" />

              <label style={lbl}>Tags (comma separated)</label>
              <input style={inp} value={form.tags} onChange={e => set('tags', e.target.value)} placeholder="JDM, Stance, All Welcome" />

              <label style={lbl}>Event Status</label>
              <select style={{ ...inp, appearance: 'none' }} value={form.status} onChange={e => set('status', e.target.value)}>
                <option value="active">Active</option>
                <option value="moved">Moved</option>
                <option value="delayed">Delayed</option>
                <option value="canceled">Canceled</option>
              </select>
            </div>

            <div>
              <label style={lbl}>Street Address</label>
              <input
                style={{ ...inp, marginBottom: 4, borderColor: addressStatus === 'found' ? '#FF6B3555' : '#1E1E1E' }}
                value={form.address}
                onChange={e => { set('address', e.target.value); setAddressStatus(''); setCoords(null) }}
                onBlur={handleAddressBlur}
                placeholder="123 Main St, City, ST"
              />
              <div style={{ fontFamily: "'DM Sans'", fontSize: 11, height: 18, marginBottom: 10 }}>
                {geocoding && <span style={{ color: '#444' }}>🔍 Looking up...</span>}
                {!geocoding && addressStatus === 'found' && <span style={{ color: '#FF6B35' }}>✓ Address found</span>}
                {!geocoding && addressStatus === 'notfound' && <span style={{ color: '#FF9944' }}>⚠️ Not found</span>}
              </div>

              <label style={lbl}>Venue / Spot Name *</label>
              <input style={inp} value={form.location} onChange={e => set('location', e.target.value)} placeholder="AutoZone Parking" />

              <label style={lbl}>City, State *</label>
              <input style={inp} value={form.city} onChange={e => set('city', e.target.value)} placeholder="Riverside, CA" />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label style={lbl}>Date *</label><input style={inp} type="date" value={form.date} onChange={e => set('date', e.target.value)} /></div>
                <div><label style={lbl}>Time</label><input style={inp} type="time" value={form.time} onChange={e => set('time', e.target.value)} /></div>
              </div>

              <label style={lbl}>Details</label>
              <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3} placeholder="What's the vibe?" style={{ ...inp, resize: 'none' }} />

              <label style={lbl}>Status Note</label>
              <input style={inp} value={form.status_note} onChange={e => set('status_note', e.target.value)} placeholder="Optional: New address or timing update" />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button onClick={onCancel} style={{ flex: 1, background: 'transparent', color: '#666', border: '1px solid #222', borderRadius: 10, padding: 12, fontFamily: "'Bebas Neue'", fontSize: 17, cursor: 'pointer' }}>
              CANCEL
            </button>
            <button onClick={handleSave} disabled={saving} style={{ flex: 2, background: saving ? '#222' : '#FF6B35', color: saving ? '#555' : '#0A0A0A', border: 'none', borderRadius: 10, padding: 12, fontFamily: "'Bebas Neue'", fontSize: 18, letterSpacing: 1.5, cursor: saving ? 'default' : 'pointer' }}>
              {saving ? 'SAVING...' : 'SAVE CHANGES'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function EventDetail({ event: initialEvent, user, saved = false, onToggleSaved, onClose, onAuthNeeded, onDeleted, onUpdated }) {
  const [event, setEvent] = useState(initialEvent)
  const [comments, setComments] = useState([])
  const [commentText, setCommentText] = useState('')
  const [rsvpStatus, setRsvpStatus] = useState(null)
  const [interestedCount, setInterestedCount] = useState(event.interested_count || 0)
  const [goingCount, setGoingCount] = useState(event.going_count || event.event_attendees?.[0]?.count || 0)
  const [posting, setPosting] = useState(false)
  const [postingUpdate, setPostingUpdate] = useState(false)
  const [copied, setCopied] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [editing, setEditing] = useState(false)
  const [updateMessage, setUpdateMessage] = useState('')
  const [updateError, setUpdateError] = useState('')

  const { isLight } = useTheme()

  const color = TYPE_COLORS[event.type] || '#FF6B35'
  const statusKey = ['active', 'moved', 'delayed', 'canceled'].includes(String(event.status || '').toLowerCase())
    ? String(event.status).toLowerCase()
    : 'active'
  const statusMeta = STATUS_META[statusKey]
  const quality = getEventQuality(event)
  const directionsUrl = getDirectionsUrl(event)
  const isOwner = user && event.user_id === user.id
  const today = new Date().toISOString().split('T')[0]
  const isPast = event.date < today

  const overlayBg = isLight ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.85)'
  const panelBg = isLight ? '#FFFFFF' : '#0F0F0F'
  const panelBorder = isLight ? '#E5E5E5' : '#1A1A1A'
  const muted = isLight ? '#666' : '#888'
  const muted2 = isLight ? '#666' : '#777'
  const divider = isLight ? '#E5E5E5' : '#141414'
  const closeBg = isLight ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.7)'
  const closeColor = isLight ? '#333' : '#fff'
  const inputBg = isLight ? '#FFFFFF' : '#141414'
  const inputBorder = isLight ? '#E5E5E5' : '#1E1E1E'
  const inputText = isLight ? '#222' : '#F0F0F0'
  const shareBg = isLight ? '#F2F2F2' : '#141414'
  const shareBorder = isLight ? '#E5E5E5' : '#222'
  const shareText = isLight ? '#666' : '#888'

  useEffect(() => {
    fetchComments(event.id).then(setComments).catch(console.error)
    if (user) getEventRsvpStatus(event.id, user.id).then(setRsvpStatus)
  }, [event.id, user])

  const handleSetRsvp = async (nextStatus) => {
    if (!user) return onAuthNeeded()
    const current = rsvpStatus
    const desired = current === nextStatus ? null : nextStatus
    await setEventRsvp(event.id, user.id, desired)
    setRsvpStatus(desired)
    if (current === 'going') setGoingCount(p => Math.max(0, p - 1))
    if (current === 'interested') setInterestedCount(p => Math.max(0, p - 1))
    if (desired === 'going') setGoingCount(p => p + 1)
    if (desired === 'interested') setInterestedCount(p => p + 1)
  }

  const handleComment = async () => {
    if (!user) return onAuthNeeded()
    if (!commentText.trim()) return
    setPosting(true)
    try {
      const c = await postComment(event.id, user.id, commentText.trim())
      setComments(p => [...p, c])
      setCommentText('')
    } catch (e) { console.error(e) }
    finally { setPosting(false) }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await supabase.from('events').delete().eq('id', event.id)
      onDeleted(event.id)
    } catch (e) { console.error(e); setDeleting(false); setConfirmDelete(false) }
  }

  const handleShare = async () => {
    try { await navigator.clipboard.writeText(window.location.href) } catch {}
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const handlePostUpdate = async () => {
    const message = updateMessage.trim()
    if (!message) return
    if (!user) return onAuthNeeded()
    setPostingUpdate(true)
    setUpdateError('')
    try {
      const row = await createEventUpdate(event.id, user.id, message)
      const updatedEvent = {
        ...event,
        latest_update_id: row.id,
        latest_update_message: row.message,
        latest_update_created_at: row.created_at,
      }
      setEvent(updatedEvent)
      onUpdated?.(updatedEvent)
      setUpdateMessage('')
    } catch (e) {
      setUpdateError(e.message || 'Failed to post update')
    } finally {
      setPostingUpdate(false)
    }
  }

  const formatDate = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  return (
    <>
      {editing && (
        <EditModal
          event={event}
          user={user}
          onSaved={(updated) => {
            setEvent(updated)
            setEditing(false)
            onUpdated?.(updated)
          }}
          onCancel={() => setEditing(false)}
        />
      )}

      <div
        onClick={e => e.target === e.currentTarget && onClose()}
        style={{ position: 'fixed', inset: 0, background: overlayBg, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      >
        <div style={{ width: '100%', maxWidth: 720, background: panelBg, borderRadius: 16, border: `1px solid ${panelBorder}`, overflow: 'hidden', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>

          {/* Hero */}
          <div style={{ position: 'relative', height: event.photo_url ? 320 : 'auto', background: isLight ? '#F2F2F2' : '#0B0B0B' }}>
            {event.photo_url && (
              <img
                src={event.photo_url}
                style={{ width: '100%', height: 320, objectFit: 'contain', background: isLight ? '#F2F2F2' : '#0B0B0B' }}
                alt=""
              />
            )}
            <div style={{ height: 4, background: color }} />
            <button onClick={onClose} style={{ position: 'absolute', top: 14, right: 14, background: closeBg, border: 'none', color: closeColor, fontSize: 20, width: 34, height: 34, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex' }}>
            {/* Left — event info */}
            <div style={{ flex: 1, padding: '24px 28px' }}>
              <span style={{ fontFamily: "'DM Sans'", fontSize: 11, fontWeight: 700, color, background: color + '22', padding: '3px 10px', borderRadius: 20, textTransform: 'capitalize' }}>{event.type}</span>
              {statusKey !== 'active' && (
                <span style={{ marginLeft: 8, fontFamily: "'DM Sans'", fontSize: 11, fontWeight: 700, color: statusMeta.fg, background: statusMeta.bg, padding: '3px 10px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {statusMeta.label}
                </span>
              )}
              {quality && (
                <span
                  style={{
                    marginLeft: 8,
                    fontFamily: "'DM Sans'",
                    fontSize: 11,
                    fontWeight: 700,
                    color: quality.fg,
                    background: quality.bg,
                    padding: '3px 10px',
                    borderRadius: 20,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}
                  title={`${quality.label} (${quality.score}/100)`}
                >
                  {quality.short}
                </span>
              )}
              <h1 style={{ fontFamily: "'Bebas Neue'", fontSize: 36, letterSpacing: 2, marginTop: 10, marginBottom: 8, lineHeight: 1 }}>{event.title}</h1>
              {statusKey !== 'active' && (
                <div style={{ marginBottom: 10, border: `1px solid ${statusMeta.fg}66`, background: statusMeta.bg, color: statusMeta.fg, borderRadius: 8, padding: '8px 10px', fontFamily: "'DM Sans'", fontSize: 12, fontWeight: 600 }}>
                  {statusMeta.label}{event.status_note ? `: ${event.status_note}` : ''}
                </div>
              )}

              <div style={{ fontFamily: "'DM Sans'", fontSize: 14, color: muted, marginBottom: 6 }}>📍 {event.address || `${event.location} · ${event.city}`}</div>
              <div style={{ fontFamily: "'DM Sans'", fontSize: 14, color, fontWeight: 600, marginBottom: 6 }}>📅 {formatDate(event.date)}{event.time ? ` · ⏰ ${event.time}` : ''}</div>
              {event.host && <div style={{ fontFamily: "'DM Sans'", fontSize: 13, color: muted, marginBottom: 14 }}>🎤 Hosted by <span style={{ color: isLight ? '#888' : '#aaa' }}>{event.host}</span></div>}

              {event.tags?.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  {event.tags.map(t => <span key={t} style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, border: `1px solid ${color}44`, color, background: color + '0D', margin: '2px', fontFamily: "'DM Sans'" }}>{t}</span>)}
                </div>
              )}

              {event.description && <p style={{ fontFamily: "'DM Sans'", fontSize: 14, color: muted2, lineHeight: 1.7, marginBottom: 20 }}>{event.description}</p>}
              {event.latest_update_message && (
                <div style={{ marginBottom: 14, border: `1px solid ${isLight ? '#F0C3B3' : '#3A241C'}`, background: isLight ? '#FFF3ED' : '#1A110D', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ fontFamily: "'DM Sans'", fontSize: 11, color: isLight ? '#D1491A' : '#FF8A5C', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>Host update</div>
                  <div style={{ fontFamily: "'DM Sans'", fontSize: 13, color: isLight ? '#444' : '#D8D8D8', lineHeight: 1.5 }}>{event.latest_update_message}</div>
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                {!isPast && (
                  <>
                    <button onClick={() => handleSetRsvp('going')} style={{ flex: 1.4, background: rsvpStatus === 'going' ? 'transparent' : color, color: rsvpStatus === 'going' ? color : '#0A0A0A', border: `1px solid ${color}`, borderRadius: 8, padding: 12, fontFamily: "'Bebas Neue'", fontSize: 16, letterSpacing: 1.2, cursor: 'pointer' }}>
                      {rsvpStatus === 'going' ? `✓ GOING · ${goingCount}` : `GOING · ${goingCount}`}
                    </button>
                    <button onClick={() => handleSetRsvp('interested')} style={{ flex: 1.2, background: rsvpStatus === 'interested' ? '#24180A' : shareBg, color: rsvpStatus === 'interested' ? '#FFD700' : shareText, border: `1px solid ${rsvpStatus === 'interested' ? '#FFD700' : shareBorder}`, borderRadius: 8, padding: 12, fontFamily: "'Bebas Neue'", fontSize: 15, letterSpacing: 1, cursor: 'pointer' }}>
                      {rsvpStatus === 'interested' ? `★ INTERESTED · ${interestedCount}` : `INTERESTED · ${interestedCount}`}
                    </button>
                  </>
                )}
                <button
                  onClick={onToggleSaved}
                  style={{
                    flex: 1,
                    background: saved ? '#27140F' : shareBg,
                    color: saved ? '#FF8A5C' : shareText,
                    border: `1px solid ${saved ? '#FF6B35' : shareBorder}`,
                    borderRadius: 8,
                    padding: 12,
                    fontFamily: "'Bebas Neue'",
                    fontSize: 15,
                    cursor: 'pointer',
                  }}
                >
                  {saved ? '★ SAVED' : '☆ SAVE'}
                </button>
                <button onClick={handleShare} style={{ flex: 1, background: shareBg, color: copied ? '#7CFF6B' : shareText, border: `1px solid ${shareBorder}`, borderRadius: 8, padding: 12, fontFamily: "'Bebas Neue'", fontSize: 15, cursor: 'pointer' }}>
                  {copied ? '✓ COPIED!' : '🔗 SHARE'}
                </button>
                <a
                  href={directionsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    flex: 1,
                    background: shareBg,
                    color: isLight ? '#D1491A' : '#FF8A5C',
                    border: `1px solid ${shareBorder}`,
                    borderRadius: 8,
                    padding: 12,
                    fontFamily: "'Bebas Neue'",
                    fontSize: 15,
                    textDecoration: 'none',
                    textAlign: 'center',
                  }}
                >
                  📍 DIRECTIONS
                </a>
              </div>

              {/* Owner controls */}
              {isOwner && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <input
                      value={updateMessage}
                      onChange={e => setUpdateMessage(e.target.value)}
                      placeholder="Post update for saved attendees..."
                      maxLength={220}
                      style={{ flex: 1, background: inputBg, border: `1px solid ${inputBorder}`, borderRadius: 8, padding: '8px 10px', color: inputText, fontFamily: "'DM Sans'", fontSize: 12, outline: 'none' }}
                    />
                    <button
                      onClick={handlePostUpdate}
                      disabled={postingUpdate || !updateMessage.trim()}
                      style={{ background: postingUpdate || !updateMessage.trim() ? '#222' : '#FF6B35', color: postingUpdate || !updateMessage.trim() ? '#555' : '#0A0A0A', border: 'none', borderRadius: 8, padding: '0 12px', fontFamily: "'Bebas Neue'", fontSize: 14, letterSpacing: 0.8, cursor: postingUpdate || !updateMessage.trim() ? 'default' : 'pointer' }}
                    >
                      {postingUpdate ? 'POSTING...' : 'POST UPDATE'}
                    </button>
                  </div>
                  {updateError && <div style={{ fontFamily: "'DM Sans'", fontSize: 12, color: '#FF7A7A', marginBottom: 8 }}>{updateError}</div>}
                  <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={() => setEditing(true)}
                    style={{ flex: 1, background: shareBg, color: isLight ? '#666' : '#888', border: `1px solid ${shareBorder}`, borderRadius: 8, padding: 10, fontFamily: "'Bebas Neue'", fontSize: 14, cursor: 'pointer', letterSpacing: 1 }}
                  >
                    ✏️ EDIT EVENT
                  </button>
                  {!confirmDelete ? (
                    <button
                      onClick={() => setConfirmDelete(true)}
                      style={{ flex: 1, background: 'transparent', color: isLight ? '#444' : '#444', border: `1px solid ${isLight ? '#E5E5E5' : '#1A1A1A'}`, borderRadius: 8, padding: 10, fontFamily: "'Bebas Neue'", fontSize: 14, cursor: 'pointer', letterSpacing: 1 }}
                    >
                      🗑 DELETE
                    </button>
                  ) : (
                    <div style={{ flex: 1, background: '#1A0A0A', border: '1px solid #FF353533', borderRadius: 8, padding: '8px 12px' }}>
                      <div style={{ fontFamily: "'DM Sans'", fontSize: 12, color: '#FF6060', textAlign: 'center', marginBottom: 8 }}>Are you sure?</div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => setConfirmDelete(false)} style={{ flex: 1, background: '#141414', color: '#888', border: '1px solid #222', borderRadius: 6, padding: '6px', cursor: 'pointer', fontFamily: "'Bebas Neue'", fontSize: 13 }}>CANCEL</button>
                        <button onClick={handleDelete} disabled={deleting} style={{ flex: 1, background: '#FF3535', color: '#fff', border: 'none', borderRadius: 6, padding: '6px', cursor: 'pointer', fontFamily: "'Bebas Neue'", fontSize: 13 }}>{deleting ? '...' : 'DELETE'}</button>
                      </div>
                    </div>
                  )}
                  </div>
                </div>
              )}
            </div>

            {/* Right — comments */}
            <div style={{ width: 280, borderLeft: `1px solid ${divider}`, display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '20px 16px 12px', fontFamily: "'Bebas Neue'", fontSize: 16, letterSpacing: 2, color: isLight ? '#444' : '#444', borderBottom: `1px solid ${divider}` }}>
                COMMENTS <span style={{ color }}>{comments.length || ''}</span>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
                {comments.length === 0 && <div style={{ color: isLight ? '#555' : '#333', fontSize: 13, fontFamily: "'DM Sans'", textAlign: 'center', paddingTop: 20 }}>No comments yet</div>}
                {comments.map(c => (
                  <div key={c.id} style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 4, alignItems: 'center' }}>
                      <div style={{ width: 24, height: 24, borderRadius: '50%', background: color + '33', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Bebas Neue'", fontSize: 12, color, flexShrink: 0 }}>
                        {(c.profiles?.username || 'U')[0].toUpperCase()}
                      </div>
                      <span style={{ fontFamily: "'DM Sans'", fontSize: 12, fontWeight: 600, color: isLight ? '#666' : '#aaa' }}>{c.profiles?.username || 'Anonymous'}</span>
                    </div>
                    <div style={{ fontFamily: "'DM Sans'", fontSize: 13, color: isLight ? '#555' : '#666', paddingLeft: 32, lineHeight: 1.5 }}>{c.text}</div>
                  </div>
                ))}
              </div>
              <div style={{ padding: '12px 16px', borderTop: `1px solid ${divider}`, display: 'flex', gap: 8 }}>
                <input
                  placeholder={user ? 'Add comment...' : 'Log in to comment'}
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleComment()}
                  disabled={!user}
                  style={{ flex: 1, background: inputBg, border: `1px solid ${inputBorder}`, borderRadius: 6, padding: '8px 10px', color: inputText, fontSize: 12, outline: 'none' }}
                />
                <button onClick={user ? handleComment : onAuthNeeded} disabled={posting} style={{ background: color, color: '#0A0A0A', border: 'none', borderRadius: 6, padding: '0 12px', fontFamily: "'Bebas Neue'", fontSize: 14, cursor: 'pointer' }}>
                  {posting ? '...' : 'POST'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
