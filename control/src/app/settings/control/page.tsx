'use client'

import { useEffect, useState } from 'react'

interface ControlSettings {
  controlBaseUrl: string
  websocketUrl: string
  wsPath: string
}

export default function ControlSettingsPage() {
  const [settings, setSettings] = useState<ControlSettings | null>(null)
  const [controlBaseUrl, setControlBaseUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    loadSettings()
  }, [])

  async function loadSettings() {
    setError('')
    try {
      const res = await fetch('/api/settings/control')
      if (!res.ok) throw new Error('Failed to load Control settings')
      const data = await res.json()
      setSettings(data)
      setControlBaseUrl(data.controlBaseUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Control settings')
    } finally {
      setLoading(false)
    }
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage('')
    setError('')
    try {
      const res = await fetch('/api/settings/control', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ controlBaseUrl }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to save Control settings')
      }
      const data = await res.json()
      setSettings(data)
      setControlBaseUrl(data.controlBaseUrl)
      setMessage('Control endpoint saved')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save Control settings')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="loading">Loading...</div>

  return (
    <div>
      <div style={{ marginBottom: '2rem' }}>
        <h1>Control Endpoint</h1>
        <p className="muted-line">
          Set the public HTTPS address that Agents and Gateways use for Control-plane WebSocket connections.
        </p>
      </div>

      {error && <div className="error" style={{ marginBottom: '1rem' }}>{error}</div>}
      {message && <div className="success" style={{ marginBottom: '1rem' }}>{message}</div>}

      <div className="card" style={{ maxWidth: '760px' }}>
        <h2>Public endpoint</h2>
        <form onSubmit={saveSettings}>
          <div className="form-group">
            <label>Control public URL</label>
            <input
              type="url"
              required
              value={controlBaseUrl}
              onChange={(e) => setControlBaseUrl(e.target.value)}
              placeholder="https://control.example.com"
            />
            <small style={{ color: '#64748b' }}>
              Use the externally reachable URL. For production this should be HTTPS through Caddy.
            </small>
          </div>
          <button type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save endpoint'}
          </button>
        </form>
      </div>

      {settings && (
        <div className="card" style={{ maxWidth: '760px', marginTop: '1rem' }}>
          <h2>Generated connection values</h2>
          <div className="provisioning-grid">
            <div>
              <span className="provisioning-label">HTTP base</span>
              <code className="provisioning-code">{settings.controlBaseUrl}</code>
            </div>
            <div>
              <span className="provisioning-label">WebSocket</span>
              <code className="provisioning-code">{settings.websocketUrl}</code>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
