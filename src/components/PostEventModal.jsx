import { useState, useRef } from 'react'
import { createEvent, uploadEventPhoto } from '../lib/supabase'

async function geocodeAddress(address) {
  if (!address || !String(address).trim()) return null
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(String(address).trim())}&format=json&limit=1`
  let lastErr
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 500 * attempt))
      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'MeetMap/1.0 (https://findcarmeets.com)',
        },
      })
      if (!res.ok) {
        lastErr = new Error(`Geocoding failed (${res.status})`)
        continue
      }
      const data = await res.json()
      if (!Array.isArray(data) || !data.length) return null
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr
}

async function extractFlyerInfo(imageBase64, mediaType = "image/jpeg") {
  const response = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
          { type: 'text', text: `Extract car meet event info from this flyer. Return ONLY a JSON object with these fields (no markdown, no explanation):
{
  "title": "event name",
  "type": "meet|car show|track day|cruise",
  "date": "YYYY-MM-DD",
  "time": "HH:MM",
  "location": "venue/spot name",
  "address": "full street address if visible",
  "city": "City, ST",
  "host": "organizer name",
  "description": "any details about the event",
  "tags": "comma separated tags like JDM, All Makes, etc"
}
If a field is not found, use empty string. For date, convert to YYYY-MM-DD format using the current year ${new Date().getFullYear()} if no year is specified on the flyer. For time use 24hr format.` }
        ]
      }]
    })
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const err =
      data?.error?.message ||
      data?.error ||
      data?.message ||
      response.statusText ||
      `Request failed (${response.status})`
    throw new Error(err)
  }
  const text = data.content?.[0]?.text || ''
  const clean = text.replace(/```json|```/g, '').trim()
  if (!text) {
    const raw = (() => {
      try {
        return JSON.stringify(data)
      } catch {
        return String(data)
      }
    })()
    const snippet = raw.replace(/\s+/g, ' ').slice(0, 220)
    throw new Error(`AI response missing content text. Response snippet: "${snippet}"`)
  }

  const parseJsonFromText = (candidate) => {
    try {
      return JSON.parse(candidate)
    } catch {}
    const firstBrace = candidate.indexOf('{')
    const lastBrace = candidate.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const sub = candidate.slice(firstBrace, lastBrace + 1)
      return JSON.parse(sub)
    }
    throw new Error('AI response was not valid JSON.')
  }

  try {
    return parseJsonFromText(clean)
  } catch (e) {
    const snippet = String(clean || '')
      .replace(/\s+/g, ' ')
      .slice(0, 180)
    throw new Error(`AI returned an unexpected response. Snippet: "${snippet}"`)
  }
}

const inp = {
  width: '100%', background: '#141414', border: '1px solid #1E1E1E',
  borderRadius: 8, padding: '10px 13px', color: '#F0F0F0',
  fontFamily: "'DM Sans', sans-serif", fontSize: 14, outline: 'none',
  marginBottom: 14, colorScheme: 'dark',
}
const lbl = {
  fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: '#555',
  letterSpacing: 1, display: 'block', marginBottom: 5, textTransform: 'uppercase',
}

export default function PostEventModal({ user, onClose, onPosted }) {
  const fileRef = useRef()
  const flyerRef = useRef()
  const submitGuardRef = useRef(false)
  const [form, setForm] = useState({ title: '', type: 'meet', date: '', time: '', location: '', city: '', address: '', description: '', tags: '', host: '' })
  const [coords, setCoords] = useState(null)
  const [photo, setPhoto] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [flyerSuccess, setFlyerSuccess] = useState(false)
  const [geocoding, setGeocoding] = useState(false)
  const [addressStatus, setAddressStatus] = useState('')
  const [error, setError] = useState('')

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleFlyerUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setScanning(true); setError(''); setFlyerSuccess(false)
    try {
      if (file.size > 8 * 1024 * 1024) {
        throw new Error('That flyer file is too large for AI extraction. Try a smaller/cropped image (under ~8MB).')
      }

      const mediaType = file.type || 'image/jpeg'
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result.split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const info = await extractFlyerInfo(base64, mediaType)
      // Treat flyer image as the event photo by default.
      setPhoto(file)
      setPhotoPreview(URL.createObjectURL(file))
      setForm(prev => ({
        ...prev,
        title: info.title || prev.title,
        type: info.type || prev.type,
        date: info.date || prev.date,
        time: info.time || prev.time,
        location: info.location || prev.location,
        address: info.address || prev.address,
        city: info.city || prev.city,
        host: info.host || prev.host,
        description: info.description || prev.description,
        tags: info.tags || prev.tags,
      }))
      setFlyerSuccess(true)
      if (info.address) {
        const result = await geocodeAddress(info.address).catch(() => null)
        if (result) { setCoords(result); setAddressStatus('found') }
      }
    } catch (e) {
      setError(e?.message || 'Could not read flyer. Try a clearer image or fill in manually.')
    } finally {
      setScanning(false)
    }
  }

  const handleAddressBlur = async () => {
    if (!form.address.trim()) return
    setGeocoding(true); setAddressStatus(''); setCoords(null)
    const result = await geocodeAddress(form.address).catch(() => null)
    setCoords(result)
    setAddressStatus(result ? 'found' : 'notfound')
    setGeocoding(false)
  }

  const handleSubmit = async () => {
    if (!form.title || !form.date || !form.location || !form.city) { setError('Please fill in all required fields.'); return }
    if (submitGuardRef.current) return
    submitGuardRef.current = true
    setError(''); setLoading(true)
    try {
      let finalCoords = coords
      if (form.address && !finalCoords) finalCoords = await geocodeAddress(form.address).catch(() => null)
      const tags = form.tags.split(',').map(t => t.trim()).filter(Boolean)
      const payload = { title: form.title, type: form.type, date: form.date, time: form.time, location: form.location, city: form.city, address: form.address, description: form.description, tags, host: form.host, lat: finalCoords?.lat || null, lng: finalCoords?.lng || null, user_id: user.id }
      const created = await createEvent(payload, user.id)
      if (photo) {
        const url = await uploadEventPhoto(photo, created.id)
        const { supabase } = await import('../lib/supabase')
        await supabase.from('events').update({ photo_url: url }).eq('id', created.id)
        created.photo_url = url
      }
      onPosted(created); onClose()
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <div style={{ width: '100%', maxWidth: 600, background: '#0F0F0F', borderRadius: 16, border: '1px solid #1A1A1A', overflow: 'hidden', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ padding: '24px 28px 32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div style={{ fontFamily: "'Bebas Neue'", fontSize: 28, letterSpacing: 2, color: '#FF6B35' }}>POST A MEET</div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#555', fontSize: 24, cursor: 'pointer' }}>×</button>
          </div>

          {/* FLYER IMPORT BUTTON */}
          <div
            onClick={() => !scanning && flyerRef.current.click()}
            style={{
              border: scanning ? '2px solid #FF6B35' : flyerSuccess ? '2px solid #7CFF6B44' : '2px dashed #FF6B3555',
              borderRadius: 12, padding: '14px 18px', marginBottom: 20,
              cursor: scanning ? 'default' : 'pointer',
              background: flyerSuccess ? '#0A1A0A' : '#0F0F0F',
              display: 'flex', alignItems: 'center', gap: 14,
              transition: 'all 0.2s',
            }}
          >
            <div style={{ fontSize: 30 }}>{scanning ? '⏳' : flyerSuccess ? '✅' : '📸'}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "'Bebas Neue'", fontSize: 18, letterSpacing: 1.5, color: flyerSuccess ? '#7CFF6B' : '#FF6B35' }}>
                {scanning ? 'READING FLYER...' : flyerSuccess ? 'FLYER IMPORTED!' : 'IMPORT FROM FLYER'}
              </div>
              <div style={{ fontFamily: "'DM Sans'", fontSize: 12, color: '#555', marginTop: 2 }}>
                {scanning ? 'AI is extracting event details...' : flyerSuccess ? 'Review the details below and edit if needed' : 'Upload a flyer image and AI will fill in all the details automatically'}
              </div>
            </div>
            {scanning && <div style={{ width: 20, height: 20, border: '2px solid #FF6B35', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />}
          </div>
          <input ref={flyerRef} type="file" accept="image/*" onChange={handleFlyerUpload} style={{ display: 'none' }} />

          {error && <div style={{ background: '#1A0A0A', border: '1px solid #FF353544', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#FF6060', fontSize: 13 }}>{error}</div>}

          {/* Two column layout */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
            <div>
              <label style={lbl}>Event Photo</label>
              <div onClick={() => fileRef.current.click()} style={{ border: '2px dashed #1E1E1E', borderRadius: 10, marginBottom: 14, height: photoPreview ? 160 : 80, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: '#111' }}>
                {photoPreview ? <img src={photoPreview} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ textAlign: 'center' }}><div style={{ fontSize: 24 }}>📸</div><div style={{ fontSize: 11, color: '#444' }}>Click to add photo</div></div>}
              </div>
              <input ref={fileRef} type="file" accept="image/*" onChange={e => { const f = e.target.files[0]; if (f) { setPhoto(f); setPhotoPreview(URL.createObjectURL(f)) } }} style={{ display: 'none' }} />

              <label style={lbl}>Event Type</label>
              <select style={{ ...inp, appearance: 'none' }} value={form.type} onChange={e => set('type', e.target.value)}>
                <option value="meet">Meet</option>
                <option value="car show">Car Show</option>
                <option value="track day">Track Day</option>
                <option value="cruise">Cruise</option>
              </select>

              <label style={lbl}>Event Name *</label>
              <input style={inp} placeholder="Sunday Funday Car Meet" value={form.title} onChange={e => set('title', e.target.value)} />

              <label style={lbl}>Hosted By</label>
              <input style={inp} placeholder="Your crew or org" value={form.host} onChange={e => set('host', e.target.value)} />

              <label style={lbl}>Tags (comma separated)</label>
              <input style={inp} placeholder="JDM, Stance, All Welcome" value={form.tags} onChange={e => set('tags', e.target.value)} />
            </div>

            <div>
              <label style={lbl}>Street Address (for map pin)</label>
              <input
                style={{ ...inp, marginBottom: 4, borderColor: addressStatus === 'found' ? '#FF6B3555' : '#1E1E1E' }}
                placeholder="123 Main St, City, ST"
                value={form.address}
                onChange={e => { set('address', e.target.value); setAddressStatus(''); setCoords(null) }}
                onBlur={handleAddressBlur}
              />
              <div style={{ fontFamily: "'DM Sans'", fontSize: 11, height: 18, marginBottom: 10 }}>
                {geocoding && <span style={{ color: '#444' }}>🔍 Looking up...</span>}
                {!geocoding && addressStatus === 'found' && <span style={{ color: '#FF6B35' }}>✓ Address found</span>}
                {!geocoding && addressStatus === 'notfound' && <span style={{ color: '#FF9944' }}>⚠️ Not found — try adding city/state</span>}
              </div>

              <label style={lbl}>Venue / Spot Name *</label>
              <input style={inp} placeholder="AutoZone Parking, Walmart Lot" value={form.location} onChange={e => set('location', e.target.value)} />

              <label style={lbl}>City, State *</label>
              <input style={inp} placeholder="Riverside, CA" value={form.city} onChange={e => set('city', e.target.value)} />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label style={lbl}>Date *</label><input style={inp} type="date" value={form.date} onChange={e => set('date', e.target.value)} /></div>
                <div><label style={lbl}>Time</label><input style={inp} type="time" value={form.time} onChange={e => set('time', e.target.value)} /></div>
              </div>

              <label style={lbl}>Details</label>
              <textarea placeholder="What's the vibe?" value={form.description} onChange={e => set('description', e.target.value)} rows={4} style={{ ...inp, resize: 'none' }} />
            </div>
          </div>

          <button type="button" onClick={handleSubmit} disabled={loading || scanning} style={{ width: '100%', background: loading || scanning ? '#222' : '#FF6B35', color: loading || scanning ? '#555' : '#0A0A0A', border: 'none', borderRadius: 10, padding: 14, fontFamily: "'Bebas Neue'", fontSize: 20, letterSpacing: 2, cursor: loading || scanning ? 'default' : 'pointer', marginTop: 8 }}>
            {loading ? 'POSTING...' : scanning ? 'READING FLYER...' : 'DROP THE PIN 📍'}
          </button>
        </div>
      </div>
    </div>
  )
}
