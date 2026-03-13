import { useState, useEffect } from 'react'
import { supabase, fetchComments, postComment, toggleAttendance, getAttendanceStatus } from '../lib/supabase'

const TYPE_COLORS = { meet: '#FF6B35', 'car show': '#FFD700', 'track day': '#00D4FF', cruise: '#7CFF6B' }

export default function EventDetail({ event, user, onClose, onAuthNeeded, onDeleted }) {
  const [comments, setComments] = useState([])
  const [commentText, setCommentText] = useState('')
  const [attending, setAttending] = useState(false)
  const [attendeeCount, setAttendeeCount] = useState(event.event_attendees?.[0]?.count || 0)
  const [posting, setPosting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const color = TYPE_COLORS[event.type] || '#FF6B35'
  const isOwner = user && event.user_id === user.id
  const today = new Date().toISOString().split('T')[0]
  const isPast = event.date < today

  useEffect(() => {
    fetchComments(event.id).then(setComments).catch(console.error)
    if (user) getAttendanceStatus(event.id, user.id).then(setAttending)
  }, [event.id, user])

  const handleAttend = async () => {
    if (!user) return onAuthNeeded()
    const now = await toggleAttendance(event.id, user.id)
    setAttending(now)
    setAttendeeCount(p => now ? p + 1 : p - 1)
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

  const formatDate = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  return (
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
    >
      <div style={{ width: '100%', maxWidth: 720, background: '#0F0F0F', borderRadius: 16, border: '1px solid #1A1A1A', overflow: 'hidden', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>

        {/* Hero */}
        <div style={{ position: 'relative', height: event.photo_url ? 260 : 'auto' }}>
          {event.photo_url && <img src={event.photo_url} style={{ width: '100%', height: 260, objectFit: 'cover' }} alt="" />}
          {event.photo_url && <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, #0F0F0F 0%, transparent 50%)' }} />}
          <div style={{ height: 4, background: color }} />
          <button onClick={onClose} style={{ position: 'absolute', top: 14, right: 14, background: 'rgba(0,0,0,0.7)', border: 'none', color: '#fff', fontSize: 20, width: 34, height: 34, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex' }}>
          {/* Left — event info */}
          <div style={{ flex: 1, padding: '24px 28px' }}>
            <span style={{ fontFamily: "'DM Sans'", fontSize: 11, fontWeight: 700, color, background: color + '22', padding: '3px 10px', borderRadius: 20, textTransform: 'capitalize' }}>{event.type}</span>
            <h1 style={{ fontFamily: "'Bebas Neue'", fontSize: 36, letterSpacing: 2, marginTop: 10, marginBottom: 8, lineHeight: 1 }}>{event.title}</h1>

            <div style={{ fontFamily: "'DM Sans'", fontSize: 14, color: '#888', marginBottom: 6 }}>📍 {event.location} · {event.city}</div>
            <div style={{ fontFamily: "'DM Sans'", fontSize: 14, color, fontWeight: 600, marginBottom: 6 }}>📅 {formatDate(event.date)}{event.time ? ` · ⏰ ${event.time}` : ''}</div>
            {event.host && <div style={{ fontFamily: "'DM Sans'", fontSize: 13, color: '#666', marginBottom: 14 }}>🎤 Hosted by <span style={{ color: '#aaa' }}>{event.host}</span></div>}

            {event.tags?.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                {event.tags.map(t => <span key={t} style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, border: `1px solid ${color}44`, color, background: color + '0D', margin: '2px', fontFamily: "'DM Sans'" }}>{t}</span>)}
              </div>
            )}

            {event.description && <p style={{ fontFamily: "'DM Sans'", fontSize: 14, color: '#777', lineHeight: 1.7, marginBottom: 20 }}>{event.description}</p>}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              {!isPast && (
                <button onClick={handleAttend} style={{ flex: 2, background: attending ? 'transparent' : color, color: attending ? color : '#0A0A0A', border: `1px solid ${color}`, borderRadius: 8, padding: 12, fontFamily: "'Bebas Neue'", fontSize: 17, letterSpacing: 1.5, cursor: 'pointer' }}>
                  {attending ? `✓ YOU'RE GOING · ${attendeeCount}` : `I'M IN · ${attendeeCount} GOING`}
                </button>
              )}
              <button onClick={handleShare} style={{ flex: 1, background: '#141414', color: copied ? '#7CFF6B' : '#888', border: '1px solid #222', borderRadius: 8, padding: 12, fontFamily: "'Bebas Neue'", fontSize: 15, cursor: 'pointer' }}>
                {copied ? '✓ COPIED!' : '🔗 SHARE'}
              </button>
            </div>

            {isOwner && !confirmDelete && (
              <button onClick={() => setConfirmDelete(true)} style={{ width: '100%', background: 'transparent', color: '#444', border: '1px solid #1A1A1A', borderRadius: 8, padding: 10, fontFamily: "'Bebas Neue'", fontSize: 14, cursor: 'pointer', letterSpacing: 1 }}>
                🗑 DELETE MY EVENT
              </button>
            )}
            {isOwner && confirmDelete && (
              <div style={{ background: '#1A0A0A', border: '1px solid #FF353533', borderRadius: 10, padding: 16 }}>
                <div style={{ fontFamily: "'DM Sans'", fontSize: 13, color: '#FF6060', textAlign: 'center', marginBottom: 12 }}>Are you sure? This cannot be undone.</div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => setConfirmDelete(false)} style={{ flex: 1, background: '#141414', color: '#888', border: '1px solid #222', borderRadius: 8, padding: 10, cursor: 'pointer', fontFamily: "'Bebas Neue'", fontSize: 14 }}>CANCEL</button>
                  <button onClick={handleDelete} disabled={deleting} style={{ flex: 1, background: '#FF3535', color: '#fff', border: 'none', borderRadius: 8, padding: 10, cursor: 'pointer', fontFamily: "'Bebas Neue'", fontSize: 14 }}>{deleting ? 'DELETING...' : 'YES, DELETE'}</button>
                </div>
              </div>
            )}
          </div>

          {/* Right — comments */}
          <div style={{ width: 280, borderLeft: '1px solid #141414', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '20px 16px 12px', fontFamily: "'Bebas Neue'", fontSize: 16, letterSpacing: 2, color: '#444', borderBottom: '1px solid #141414' }}>
              COMMENTS <span style={{ color }}>{comments.length || ''}</span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
              {comments.length === 0 && <div style={{ color: '#333', fontSize: 13, fontFamily: "'DM Sans'", textAlign: 'center', paddingTop: 20 }}>No comments yet</div>}
              {comments.map(c => (
                <div key={c.id} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 4, alignItems: 'center' }}>
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: color + '33', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Bebas Neue'", fontSize: 12, color, flexShrink: 0 }}>
                      {(c.profiles?.username || 'U')[0].toUpperCase()}
                    </div>
                    <span style={{ fontFamily: "'DM Sans'", fontSize: 12, fontWeight: 600, color: '#aaa' }}>{c.profiles?.username || 'Anonymous'}</span>
                  </div>
                  <div style={{ fontFamily: "'DM Sans'", fontSize: 13, color: '#666', paddingLeft: 32, lineHeight: 1.5 }}>{c.text}</div>
                </div>
              ))}
            </div>
            <div style={{ padding: '12px 16px', borderTop: '1px solid #141414', display: 'flex', gap: 8 }}>
              <input
                placeholder={user ? 'Add comment...' : 'Log in to comment'}
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleComment()}
                disabled={!user}
                style={{ flex: 1, background: '#141414', border: '1px solid #1E1E1E', borderRadius: 6, padding: '8px 10px', color: '#F0F0F0', fontSize: 12, outline: 'none' }}
              />
              <button onClick={user ? handleComment : onAuthNeeded} disabled={posting} style={{ background: color, color: '#0A0A0A', border: 'none', borderRadius: 6, padding: '0 12px', fontFamily: "'Bebas Neue'", fontSize: 14, cursor: 'pointer' }}>
                {posting ? '...' : 'POST'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
