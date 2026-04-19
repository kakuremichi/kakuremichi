'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function SetupPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [allowed, setAllowed] = useState<boolean | null>(null)

  useEffect(() => {
    fetch('/api/auth/setup')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.needsSetup) {
          setAllowed(true)
        } else {
          setAllowed(false)
          router.replace('/login')
        }
      })
      .catch(() => setAllowed(false))
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error || 'Setup failed')
        return
      }
      router.replace('/')
      router.refresh()
    } catch {
      setError('Network error')
    } finally {
      setSubmitting(false)
    }
  }

  if (allowed === null) return null
  if (allowed === false) return null

  return (
    <div style={{ maxWidth: '480px', margin: '4rem auto' }}>
      <div className="card">
        <h1>Initial setup</h1>
        <p style={{ color: '#666', marginBottom: '1.5rem' }}>
          Create the first admin account. This account will have full control over kakuremichi.
        </p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Admin email</label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          <div className="form-group">
            <label>Password (min. 8 characters)</label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="form-group">
            <label>Confirm password</label>
            <input
              type="password"
              required
              minLength={8}
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          {error && <p style={{ color: '#b91c1c' }}>{error}</p>}
          <button type="submit" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create admin account'}
          </button>
        </form>
      </div>
    </div>
  )
}
