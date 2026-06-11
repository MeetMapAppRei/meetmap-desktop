import { useEffect, useState } from 'react'
import { getAuthRedirectUrl } from '../lib/apiOrigin'
import { signIn, signUp, supabase } from '../lib/supabase'

const inp = {
  width: '100%',
  background: '#141414',
  border: '1px solid #1E1E1E',
  borderRadius: 8,
  padding: '12px 14px',
  color: '#F0F0F0',
  fontFamily: "'DM Sans', sans-serif",
  fontSize: 14,
  outline: 'none',
  marginBottom: 12,
  colorScheme: 'dark',
}

export default function AuthModal({ onClose, onSuccess, initialMode = 'login' }) {
  const [mode, setMode] = useState(initialMode) // login | signup | reset | new-password
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    setMode(initialMode)
    setError('')
    setSuccess('')
  }, [initialMode])

  const switchMode = (newMode) => {
    setMode(newMode)
    setError('')
    setSuccess('')
    setPassword('')
    setConfirmPassword('')
  }

  const handleSubmit = async () => {
    setError('')
    setLoading(true)
    try {
      if (mode === 'login') {
        const { error } = await signIn(email, password)
        if (error) throw error
        onSuccess()
      } else if (mode === 'signup') {
        if (!username.trim()) throw new Error('Username is required')
        if (password.length < 6) throw new Error('Password must be at least 6 characters')
        const { error } = await signUp(email, password, username)
        if (error) throw error
        setSuccess('Account created! You can now log in.')
        setTimeout(() => {
          switchMode('login')
        }, 2000)
      } else if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: getAuthRedirectUrl(),
        })
        if (error) throw error
        setSuccess('Password reset email sent! Check your inbox.')
      } else if (mode === 'new-password') {
        if (password.length < 6) throw new Error('Password must be at least 6 characters')
        if (password !== confirmPassword) throw new Error('Passwords do not match')
        const { error } = await supabase.auth.updateUser({ password })
        if (error) throw error
        setSuccess('Password updated! You can now log in with your new password.')
        setTimeout(() => onClose(), 2000)
      }
    } catch (e) {
      const msg = e.message || 'Something went wrong'
      if (msg.includes('Invalid login')) setError('Incorrect email or password.')
      else if (msg.includes('already registered')) setError('An account with this email already exists.')
      else setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const titles = {
    login: 'WELCOME BACK',
    signup: 'JOIN THE SCENE',
    reset: 'RESET PASSWORD',
    'new-password': 'SET NEW PASSWORD',
  }
  const btnLabels = {
    login: 'LOG IN',
    signup: 'CREATE ACCOUNT',
    reset: 'SEND RESET EMAIL',
    'new-password': 'UPDATE PASSWORD',
  }

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.85)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: 420,
          background: '#0F0F0F',
          borderRadius: 16,
          border: '1px solid #1A1A1A',
          padding: '32px 28px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 24,
          }}
        >
          <div style={{ fontFamily: "'Bebas Neue'", fontSize: 28, letterSpacing: 2, color: '#FF6B35' }}>
            {titles[mode]}
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#555', fontSize: 24, cursor: 'pointer' }}
          >
            ×
          </button>
        </div>

        {error && (
          <div
            style={{
              background: '#1A0A0A',
              border: '1px solid #FF353544',
              borderRadius: 8,
              padding: '10px 14px',
              marginBottom: 14,
              color: '#FF6060',
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}
        {success && (
          <div
            style={{
              background: '#0A1A0A',
              border: '1px solid #7CFF6B44',
              borderRadius: 8,
              padding: '10px 14px',
              marginBottom: 14,
              color: '#7CFF6B',
              fontSize: 13,
            }}
          >
            {success}
          </div>
        )}

        {mode === 'signup' && (
          <input
            style={inp}
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        )}

        {mode !== 'new-password' && (
          <input
            style={inp}
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        )}

        {mode === 'new-password' && (
          <div style={{ fontFamily: "'DM Sans'", fontSize: 13, color: '#888', marginBottom: 12, lineHeight: 1.45 }}>
            Choose a new password for your account.
          </div>
        )}

        {mode !== 'reset' && (
          <input
            style={inp}
            type="password"
            placeholder={
              mode === 'signup'
                ? 'Password (min 6 characters)'
                : mode === 'new-password'
                  ? 'New password (min 6 characters)'
                  : 'Password'
            }
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          />
        )}

        {mode === 'new-password' && (
          <input
            style={inp}
            type="password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          />
        )}

        {mode === 'login' && (
          <div style={{ textAlign: 'right', marginTop: -6, marginBottom: 8 }}>
            <span
              onClick={() => switchMode('reset')}
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 12,
                color: '#888',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Forgot password?
            </span>
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{
            width: '100%',
            background: loading ? '#222' : '#FF6B35',
            color: loading ? '#555' : '#0A0A0A',
            border: 'none',
            borderRadius: 10,
            padding: 14,
            fontFamily: "'Bebas Neue'",
            fontSize: 20,
            letterSpacing: 2,
            cursor: loading ? 'default' : 'pointer',
            marginBottom: 16,
          }}
        >
          {loading ? '...' : btnLabels[mode]}
        </button>

        <div style={{ textAlign: 'center', fontFamily: "'DM Sans'", fontSize: 13, color: '#555' }}>
          {mode === 'login' && (
            <>
              Don&apos;t have an account?{' '}
              <span
                onClick={() => switchMode('signup')}
                style={{ color: '#FF6B35', cursor: 'pointer', fontWeight: 600 }}
              >
                Sign up free
              </span>
            </>
          )}
          {mode === 'signup' && (
            <>
              Already have an account?{' '}
              <span
                onClick={() => switchMode('login')}
                style={{ color: '#FF6B35', cursor: 'pointer', fontWeight: 600 }}
              >
                Log in
              </span>
            </>
          )}
          {(mode === 'reset' || mode === 'new-password') && (
            <span
              onClick={() => switchMode('login')}
              style={{ color: '#FF6B35', cursor: 'pointer', fontWeight: 600 }}
            >
              ← Back to login
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
