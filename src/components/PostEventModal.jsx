import { useState, useRef } from 'react'
import { createEvent, uploadEventPhoto } from '../lib/supabase'

async function geocodeAddress(address) {
  const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`)
  const data = await res.json()
  if (!data.length) return null
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
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
  const [form, setForm] = useState({ title: '', type: 'meet', date: '', time: '', location: '', city: '', address: '', description: '', tags: '', host: '' })
  const [coords, setCoords] = useState(null)
  const [photo, setPhoto] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [geocoding, setGeocoding] = useState(false)
  const [addressStatus, setAddressStatus] = useState('')
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

  const handleSubmit = async () => {
    if (!form.title || !form.date || !form.location || !form.city) { setError('Please fill in all required fields.'); return }
    setError(''); setLoading(true)
    try {
      let finalCoords = coords
      if (form.address && !finalCoords) finalCoords = await geocodeAddress(form.address).catch(() => null)
      const tags = form.tags.split(',').map(t => t.trim()).filter(Boolean)
      const payload = { title: form.title, type: form.type, date: form.date, time: form.time, location: form.location, city: form.city, description: form.description, tags, host: form.host, lat: finalCoords?.lat || null, lng: finalCoords?.lng || null, user_id: user.id }
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
      <div style={{ width: '100%', maxWidth: 600, background: '#0F0F0F', borderRadius: 16, border: '1px solid #1A1A1A', overflow: 'hidden', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ padding: '24px 28px 32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <div style={{ fontFamily: "'Bebas Neue'", fontSize: 28, letterSpacing: 2, color: '#FF6B35' }}>POST A MEET</div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#555', fontSize: 24, cursor: 'pointer' }}>×</button>
          </div>

          {error && <div style={{ background: '#1A0A0A', border: '1px solid #FF353544', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#FF6060', fontSize: 13 }}>{error}</div>}

          {/* Two column layout */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
            {/* Left col */}
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

            {/* Right col */}
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
                {!geocoding && addressStatus === 'notfound' && <span style={{ color: '#FF9944' }}>⚠️ Address not found — try adding city/state</span>}
              </div>

              <label style={lbl}>Venue / Spot Name *</label>
              <input style={inp} placeholder="AutoZone Parking, Walmart Lot" value={form.location} onChange={e => set('location', e.target.value)} />

              <label style={lbl}>City, State *</label>
              <input style={inp} placeholder="Riverside, CA" value={form.city} onChange={e => set('city', e.target.value)} />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={lbl}>Date *</label>
                  <input style={inp} type="date" value={form.date} onChange={e => set('date', e.target.value)} />
                </div>
                <div>
                  <label style={lbl}>Time</label>
                  <input style={inp} type="time" value={form.time} onChange={e => set('time', e.target.value)} />
                </div>
              </div>

              <label style={lbl}>Details</label>
              <textarea placeholder="What's the vibe?" value={form.description} onChange={e => set('description', e.target.value)} rows={4} style={{ ...inp, resize: 'none' }} />
            </div>
          </div>

          <button onClick={handleSubmit} disabled={loading} style={{ width: '100%', background: loading ? '#222' : '#FF6B35', color: loading ? '#555' : '#0A0A0A', border: 'none', borderRadius: 10, padding: 14, fontFamily: "'Bebas Neue'", fontSize: 20, letterSpacing: 2, cursor: loading ? 'default' : 'pointer', marginTop: 8 }}>
            {loading ? 'POSTING...' : 'DROP THE PIN 📍'}
          </button>
        </div>
      </div>
    </div>
  )
}
