'use client'

import { useEffect, useState } from 'react'

type Scope = 'read' | 'write' | 'admin'

interface TokenRow {
  id: string
  name: string
  prefix: string
  scopes: Scope[]
  lastUsedAt: string | null
  expiresAt: string | null
  createdAt: string
}

export default function TokensPage() {
  const [tokens, setTokens] = useState<TokenRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [scopes, setScopes] = useState<Scope[]>(['read'])
  const [expiresInDays, setExpiresInDays] = useState<string>('')
  const [newToken, setNewToken] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function fetchTokens() {
    try {
      const res = await fetch('/api/tokens')
      if (!res.ok) throw new Error()
      setTokens(await res.json())
    } catch {
      setError('Failed to load tokens')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchTokens() }, [])

  function toggleScope(s: Scope) {
    setScopes(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }

  async function createToken(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!name.trim() || scopes.length === 0) {
      setError('Name and at least one scope are required')
      return
    }
    const body: any = { name, scopes }
    if (expiresInDays) body.expiresInDays = Number(expiresInDays)
    const res = await fetch('/api/tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error || 'Failed to create token')
      return
    }
    const d = await res.json()
    setNewToken(d.token)
    setName('')
    setScopes(['read'])
    setExpiresInDays('')
    setShowForm(false)
    fetchTokens()
  }

  async function revokeToken(id: string) {
    if (!confirm('Revoke this token? This cannot be undone.')) return
    const res = await fetch(`/api/tokens/${id}`, { method: 'DELETE' })
    if (res.ok) fetchTokens()
  }

  if (loading) return <div className="loading">Loading…</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1>API Tokens</h1>
        <button onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : 'New Token'}
        </button>
      </div>

      <p style={{ color: '#666', marginBottom: '1rem' }}>
        Personal access tokens let you authenticate with the kakuremichi API from scripts and external tools using the <code>Authorization: Bearer kmt_…</code> header.
      </p>

      {newToken && (
        <div className="card" style={{ marginBottom: '2rem', borderLeft: '4px solid #f59e0b' }}>
          <h2>Your new token</h2>
          <p style={{ color: '#b45309', marginBottom: '1rem' }}>
            Copy this now — it will not be shown again.
          </p>
          <code style={{ display: 'block', padding: '0.75rem', background: '#f3f4f6', wordBreak: 'break-all' }}>
            {newToken}
          </code>
          <button style={{ marginTop: '1rem' }} onClick={() => setNewToken(null)}>
            I&apos;ve saved it
          </button>
        </div>
      )}

      {showForm && (
        <div className="card" style={{ marginBottom: '2rem' }}>
          <h2>Create token</h2>
          <form onSubmit={createToken}>
            <div className="form-group">
              <label>Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. CI deploy"
                required
              />
            </div>
            <div className="form-group">
              <label>Scopes</label>
              <div style={{ display: 'flex', gap: '1rem' }}>
                {(['read', 'write', 'admin'] as Scope[]).map(s => (
                  <label key={s} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 400 }}>
                    <input
                      type="checkbox"
                      checked={scopes.includes(s)}
                      onChange={() => toggleScope(s)}
                    />
                    {s}
                  </label>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label>Expires in (days) — leave empty for no expiry</label>
              <input
                type="number"
                min={1}
                max={3650}
                value={expiresInDays}
                onChange={e => setExpiresInDays(e.target.value)}
                placeholder="e.g. 90"
              />
            </div>
            {error && <p style={{ color: '#b91c1c' }}>{error}</p>}
            <button type="submit">Create token</button>
          </form>
        </div>
      )}

      <div className="card">
        <h2>Active tokens ({tokens.length})</h2>
        {tokens.length === 0 ? (
          <p style={{ color: '#666' }}>No tokens yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Prefix</th>
                <th>Scopes</th>
                <th>Last used</th>
                <th>Expires</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tokens.map(t => (
                <tr key={t.id}>
                  <td><strong>{t.name}</strong></td>
                  <td><code>{t.prefix}…</code></td>
                  <td>{(t.scopes ?? []).join(', ')}</td>
                  <td style={{ color: '#666' }}>
                    {t.lastUsedAt ? new Date(t.lastUsedAt).toLocaleString() : 'Never'}
                  </td>
                  <td style={{ color: '#666' }}>
                    {t.expiresAt ? new Date(t.expiresAt).toLocaleDateString() : 'Never'}
                  </td>
                  <td>
                    <button className="danger" onClick={() => revokeToken(t.id)}>Revoke</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
