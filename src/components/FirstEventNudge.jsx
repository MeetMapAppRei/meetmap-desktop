import { useEffect, useState } from 'react'
import { useHasPosted } from '../hooks/useHasPosted'

export default function FirstEventNudge({ userId, onPost }) {
  const { hasPosted, loading } = useHasPosted(userId)
  const [dismissed, setDismissed] = useState(true)
  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem('nudge_dismissed') === 'true')
    } catch {
      setDismissed(false)
    }
  }, [])
  if (loading || dismissed || hasPosted) return null
  return (
    <div
      style={{
        background: '#121212',
        border: '1px solid #FF6B3544',
        borderRadius: 12,
        padding: 12,
        color: '#EEE',
        fontFamily: "'DM Sans', sans-serif",
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <div style={{ flex: 1, fontSize: 13, lineHeight: 1.3 }}>
        You&apos;re on the map. Now put your event on it.
      </div>
      <button
        onClick={onPost}
        style={{
          background: '#FF6B35',
          color: '#0A0A0A',
          border: 'none',
          borderRadius: 10,
          padding: '9px 12px',
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 16,
          letterSpacing: 1,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        Post an event →
      </button>
      <button
        onClick={() => {
          try {
            window.localStorage.setItem('nudge_dismissed', 'true')
          } catch {}
          setDismissed(true)
        }}
        aria-label="Dismiss"
        style={{
          background: 'transparent',
          color: '#AAA',
          border: 'none',
          cursor: 'pointer',
          fontSize: 18,
          lineHeight: 1,
          padding: '0 4px',
        }}
      >
        ×
      </button>
    </div>
  )
}

