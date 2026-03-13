import { useState } from 'react'
import { signIn, signUp } from '../lib/supabase'

const inp = {
  width: '100%', background: '#141414', border: '1px solid #1E1E1E',
  borderRadius: 8, padding: '12px 14px', color: '#F0F0F0',
  fontFamily: "'DM Sans', sans-serif", fontSize: 14, outline: 'none',
  marginBottom: 12, colorScheme: 'dark',
}

export default function AuthModal({ onClose, onSuccess }) {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleSubmit = async () => {
    setError(''); setLoading(true)
    try {
      if (mode === 'login') {
        const { error } = await signIn(email, password)
        if (error) throw error
        onSuccess()
      } else {
        const { error } = await signUp(email, password, username)
        if (error) throw error
        setSuccess('Account created! You can now log in.')
        setTimeout(() => { setMode('login'); setSuccess('') }, 2000)
      }
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 420, background: '#0F0F0F', borderRadius: 16, border: '1px solid #1A1A1A', padding: '32px 28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div style={{ fontFamily: "'Bebas Neue'", fontSize: 28, letterSpacing: 2, color: '#FF6B35' }}>
            {mode === 'login' ? 'WELCOME BACK' : 'JOIN THE SCENE'}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#555', fontSize: 24, cursor: 'pointer' }}>×</button>
        </div>

        {error && <div style={{ background: '#1A0A0A', border: '1px solid #FF353544', borderRadius: 8, padding: '10px 14px', marginBottom: 14, color: '#FF6060', fontSize: 13 }}>{error}</div>}
        {success && <div style={{ background: '#0A1A0A', border: '1px solid #7CFF6B44', borderRadius: 8, padding: '10px 14px', marginBottom: 14, color: '#7CFF6B', fontSize: 13 }}>{success}</div>}

        {mode === 'signup' && <input style={inp} placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} />}
        <input style={inp} type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
        <input style={inp} type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSubmit()} />

        <button onClick={handleSubmit} disabled={loading} style={{ width: '100%', background: loading ? '#222' : '#FF6B35', color: loading ? '#555' : '#0A0A0A', border: 'none', borderRadius: 10, padding: 14, fontFamily: "'Bebas Neue'", fontSize: 20, letterSpacing: 2, cursor: loading ? 'default' : 'pointer', marginBottom: 16 }}>
          {loading ? '...' : mode === 'login' ? 'LOG IN' : 'CREATE ACCOUNT'}
        </button>

        <div style={{ textAlign: 'center', fontFamily: "'DM Sans'", fontSize: 13, color: '#555' }}>
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <span onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError('') }} style={{ color: '#FF6B35', cursor: 'pointer', fontWeight: 600 }}>
            {mode === 'login' ? 'Sign up free' : 'Log in'}
          </span>
        </div>
      </div>
    </div>
  )
}
