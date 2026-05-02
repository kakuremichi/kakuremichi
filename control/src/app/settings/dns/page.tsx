'use client'

import { useEffect, useState } from 'react'

interface DNSProviderRow {
  id: string
  name: string
  type: string
  enabled: boolean
  lastSyncAt: string | null
  lastError: string | null
  createdAt: string
}

interface DNSZoneRow {
  id: string
  name: string
  providerName: string
  providerType: string
  enabled: boolean
}

export default function DNSSettingsPage() {
  const [providers, setProviders] = useState<DNSProviderRow[]>([])
  const [zones, setZones] = useState<DNSZoneRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('Cloudflare')
  const [apiToken, setApiToken] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function fetchData() {
    try {
      setError('')
      const [providersRes, zonesRes] = await Promise.all([
        fetch('/api/dns/providers'),
        fetch('/api/dns/zones'),
      ])
      if (!providersRes.ok || !zonesRes.ok) throw new Error('Failed to load DNS settings')
      setProviders(await providersRes.json())
      setZones(await zonesRes.json())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load DNS settings')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  async function createProvider(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setMessage('')
    const res = await fetch('/api/dns/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, type: 'cloudflare', apiToken }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data.error || 'Failed to create DNS provider')
      return
    }
    setApiToken('')
    setShowForm(false)
    setMessage('DNS provider connected')
    fetchData()
  }

  async function importZones(providerId: string) {
    setError('')
    setMessage('')
    const res = await fetch(`/api/dns/providers/${providerId}/zones/import`, { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data.error || 'Failed to import DNS zones')
      return
    }
    setMessage(`Imported ${data.zones?.length ?? 0} zones`)
    fetchData()
  }

  async function syncAll() {
    setError('')
    setMessage('')
    const res = await fetch('/api/dns/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data.error || 'Failed to sync DNS')
      return
    }
    setMessage(`Synced ${data.results?.length ?? 0} DNS settings`)
    fetchData()
  }

  async function deleteProvider(id: string) {
    if (!confirm('Delete this DNS provider and local zone settings? Managed remote DNS records are not deleted automatically.')) return
    const res = await fetch(`/api/dns/providers/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Failed to delete DNS provider')
      return
    }
    fetchData()
  }

  if (loading) return <div className="loading">Loading...</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1>DNS Sync</h1>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="secondary" onClick={syncAll}>Sync All</button>
          <button onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancel' : 'New Provider'}
          </button>
        </div>
      </div>

      <p style={{ color: '#666', marginBottom: '1rem' }}>
        DNS Sync keeps tunnel hostnames pointed at Gateway public IPs. Cloudflare DNS records are created as DNS-only by default.
      </p>

      {error && <div className="error">{error}</div>}
      {message && (
        <div style={{ background: '#d1fae5', color: '#047857', padding: '1rem', borderRadius: '6px', marginBottom: '1rem' }}>
          {message}
        </div>
      )}

      {showForm && (
        <div className="card">
          <h2>Connect Cloudflare</h2>
          <form onSubmit={createProvider}>
            <div className="form-group">
              <label>Name</label>
              <input value={name} onChange={e => setName(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>API Token</label>
              <input
                type="password"
                value={apiToken}
                onChange={e => setApiToken(e.target.value)}
                placeholder="Cloudflare API token with Zone:Read and DNS:Edit"
                required
              />
            </div>
            <button type="submit">Connect Provider</button>
          </form>
        </div>
      )}

      <div className="card">
        <h2>Providers ({providers.length})</h2>
        {providers.length === 0 ? (
          <p style={{ color: '#666' }}>No DNS providers connected.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Status</th>
                <th>Last Sync</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {providers.map(provider => (
                <tr key={provider.id}>
                  <td><strong>{provider.name}</strong></td>
                  <td>{provider.type}</td>
                  <td>
                    <span className={`status ${provider.enabled && !provider.lastError ? 'online' : 'offline'}`}>
                      {provider.lastError ? 'Error' : provider.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                    {provider.lastError && (
                      <div style={{ color: '#b91c1c', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                        {provider.lastError}
                      </div>
                    )}
                  </td>
                  <td style={{ color: '#666' }}>
                    {provider.lastSyncAt ? new Date(provider.lastSyncAt).toLocaleString() : 'Never'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="secondary" onClick={() => importZones(provider.id)}>Import Zones</button>
                      <button className="danger" onClick={() => deleteProvider(provider.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Zones ({zones.length})</h2>
        {zones.length === 0 ? (
          <p style={{ color: '#666' }}>Import zones from a provider before enabling DNS sync on tunnels.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Zone</th>
                <th>Provider</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {zones.map(zone => (
                <tr key={zone.id}>
                  <td><strong>{zone.name}</strong></td>
                  <td>{zone.providerName} ({zone.providerType})</td>
                  <td>
                    <span className={`status ${zone.enabled ? 'online' : 'offline'}`}>
                      {zone.enabled ? 'Enabled' : 'Disabled'}
                    </span>
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
