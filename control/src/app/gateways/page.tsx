'use client'

import { useEffect, useState } from 'react'

interface Gateway {
  id: string
  name: string
  apiKeyPrefix: string | null
  publicIp: string | null
  wireguardPublicKey: string | null
  status: string
  lastSeenAt: string | null
  metadata: GatewayMetadata | null
  createdAt: string
}

interface CreatedGatewayCredential {
  name: string
  apiKey: string
  connection: ControlConnectionConfig
}

interface ControlConnectionConfig {
  controlBaseUrl: string
  websocketUrl: string
  wsPath: string
}

interface GatewayMetadata {
  httpProxy?: GatewayHTTPProxyRuntime
}

interface GatewayHTTPProxyRuntime {
  httpAddress: string
  httpsAddress: string
  httpListening: boolean
  httpsListening: boolean
  tlsMode: 'disabled' | 'acme' | 'manual' | string
  acmeEnabled: boolean
  acmeStaging: boolean
  acmeEmailConfigured: boolean
  manualTlsEnabled: boolean
  routeCount: number
}

export default function GatewaysPage() {
  const [gateways, setGateways] = useState<Gateway[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showNewForm, setShowNewForm] = useState(false)
  const [newGatewayName, setNewGatewayName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ publicIp: '' })
  const [createdCredential, setCreatedCredential] = useState<CreatedGatewayCredential | null>(null)
  const [connectionConfig, setConnectionConfig] = useState<ControlConnectionConfig | null>(null)

  useEffect(() => {
    fetchGateways()
    fetchConnectionConfig()
  }, [])

  async function fetchGateways() {
    try {
      const res = await fetch('/api/gateways')
      if (!res.ok) throw new Error('Failed to fetch gateways')
      const data = await res.json()
      setGateways(data)
    } catch (err) {
      setError('Failed to load gateways')
    } finally {
      setLoading(false)
    }
  }

  async function fetchConnectionConfig() {
    try {
      const res = await fetch('/api/settings/control')
      if (!res.ok) return
      setConnectionConfig(await res.json())
    } catch {
      // Provisioning commands can still be shown after create because the API returns them.
    }
  }

  async function createGateway() {
    if (!newGatewayName.trim()) {
      alert('Please enter gateway name')
      return
    }

    try {
      const res = await fetch('/api/gateways', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newGatewayName }),
      })

      if (!res.ok) throw new Error('Failed to create gateway')
      const created = await res.json()

      setCreatedCredential({
        name: created.name,
        apiKey: created.apiKey,
        connection: created.connection || connectionConfig || {
          controlBaseUrl: 'http://localhost:3000',
          websocketUrl: 'ws://localhost:3000/ws',
          wsPath: '/ws',
        },
      })
      setNewGatewayName('')
      setShowNewForm(false)
      fetchGateways()
    } catch (err) {
      alert('Failed to create gateway')
    }
  }

  async function deleteGateway(id: string) {
    if (!confirm('Are you sure you want to delete this gateway?')) return

    try {
      const res = await fetch(`/api/gateways/${id}`, {
        method: 'DELETE',
      })

      if (!res.ok) throw new Error('Failed to delete gateway')
      fetchGateways()
    } catch (err) {
      alert('Failed to delete gateway')
    }
  }

  function startEdit(gateway: Gateway) {
    setEditingId(gateway.id)
    setEditForm({ publicIp: gateway.publicIp || '' })
  }

  function cancelEdit() {
    setEditingId(null)
    setEditForm({ publicIp: '' })
  }

  async function saveEdit(id: string) {
    try {
      const res = await fetch(`/api/gateways/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicIp: editForm.publicIp || null }),
      })

      if (!res.ok) throw new Error('Failed to update gateway')

      setEditingId(null)
      setEditForm({ publicIp: '' })
      fetchGateways()
    } catch (err) {
      alert('Failed to update gateway')
    }
  }

  function runtimeLabel(runtime: GatewayHTTPProxyRuntime | undefined) {
    if (!runtime) return 'unknown'
    if (runtime.httpsListening) {
      if (runtime.tlsMode === 'acme') return runtime.acmeStaging ? 'HTTPS (ACME staging)' : 'HTTPS (ACME)'
      if (runtime.tlsMode === 'manual') return 'HTTPS (manual)'
      return 'HTTPS'
    }
    if (runtime.httpListening) return 'HTTP only'
    return 'not listening'
  }

  function listenerText(address: string, listening: boolean) {
    return `${address || '-'} ${listening ? 'listening' : 'off'}`
  }

  if (loading) return <div className="loading">Loading...</div>
  if (error) return <div className="error">{error}</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1>Gateways</h1>
        <button onClick={() => setShowNewForm(!showNewForm)}>
          {showNewForm ? 'Cancel' : 'New Gateway'}
        </button>
      </div>

      {createdCredential && (
        <div className="card" style={{ marginBottom: '2rem', borderLeft: '4px solid #f59e0b' }}>
          <h2>New Gateway Connection</h2>
          <p style={{ color: '#92400e', marginBottom: '1rem' }}>
            Save this key now. It is shown only after creation.
          </p>
          <p style={{ color: '#666', marginBottom: '0.5rem' }}>{createdCredential.name}</p>
          <code style={{ display: 'block', padding: '0.75rem', background: '#f3f4f6', wordBreak: 'break-all' }}>
            {createdCredential.apiKey}
          </code>
          <div className="provisioning-grid" style={{ marginTop: '1rem' }}>
            <ProvisioningBlock
              title="gateway.env"
              value={[
                `CONTROL_URL=${createdCredential.connection.websocketUrl}`,
                `API_KEY=${createdCredential.apiKey}`,
                'PUBLIC_IP=auto',
              ].join('\n')}
            />
            <ProvisioningBlock
              title="Run command"
              value={[
                './gateway',
                `--control-url=${createdCredential.connection.websocketUrl}`,
                `--api-key=${createdCredential.apiKey}`,
                '--public-ip=auto',
              ].join(' ')}
            />
          </div>
          <button className="secondary" style={{ marginTop: '1rem' }} onClick={() => setCreatedCredential(null)}>
            Dismiss
          </button>
        </div>
      )}

      {connectionConfig && !createdCredential && (
        <div className="card" style={{ marginBottom: '2rem' }}>
          <h2>Gateway connection template</h2>
          <p className="muted-line">New Gateways will connect to <code>{connectionConfig.websocketUrl}</code>.</p>
        </div>
      )}

      {showNewForm && (
        <div className="card" style={{ marginBottom: '2rem' }}>
          <h2>Create New Gateway</h2>
          <div className="form-group">
            <label>Gateway Name</label>
            <input
              type="text"
              value={newGatewayName}
              onChange={(e) => setNewGatewayName(e.target.value)}
              placeholder="gateway-1"
            />
          </div>
          <button onClick={createGateway}>Create Gateway</button>
        </div>
      )}

      <div className="card">
        <h2>Gateway List ({gateways.length})</h2>
        {gateways.length === 0 ? (
          <p style={{ color: '#666' }}>No gateways yet. Create one to get started.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Public IP</th>
                <th>Runtime</th>
                <th>API Key</th>
                <th>Last Seen</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {gateways.map((gateway) => (
                <tr key={gateway.id}>
                  <td><strong>{gateway.name}</strong></td>
                  <td>
                    <span className={`status ${gateway.status}`}>
                      {gateway.status}
                    </span>
                  </td>
                  <td>
                    {editingId === gateway.id ? (
                      <input
                        type="text"
                        value={editForm.publicIp}
                        onChange={(e) => setEditForm({ publicIp: e.target.value })}
                        placeholder="1.2.3.4"
                        style={{ width: '120px', fontSize: '0.875rem' }}
                      />
                    ) : (
                      <code>{gateway.publicIp || '-'}</code>
                    )}
                  </td>
                  <td style={{ fontSize: '0.875rem' }}>
                    {gateway.metadata?.httpProxy ? (
                      <>
                        <span className={`status ${gateway.metadata.httpProxy.httpListening || gateway.metadata.httpProxy.httpsListening ? 'online' : 'offline'}`}>
                          {runtimeLabel(gateway.metadata.httpProxy)}
                        </span>
                        <div style={{ color: '#666', marginTop: '0.25rem' }}>
                          HTTP {listenerText(gateway.metadata.httpProxy.httpAddress, gateway.metadata.httpProxy.httpListening)}
                        </div>
                        <div style={{ color: '#666' }}>
                          HTTPS {listenerText(gateway.metadata.httpProxy.httpsAddress, gateway.metadata.httpProxy.httpsListening)}
                        </div>
                        <div style={{ color: '#666' }}>
                          routes {gateway.metadata.httpProxy.routeCount}
                        </div>
                      </>
                    ) : (
                      <span style={{ color: '#666' }}>Unknown</span>
                    )}
                  </td>
                  <td>
                    <code style={{ fontSize: '0.75rem' }}>
                      {gateway.apiKeyPrefix ? `${gateway.apiKeyPrefix}...` : '-'}
                    </code>
                  </td>
                  <td style={{ fontSize: '0.875rem', color: '#666' }}>
                    {gateway.lastSeenAt
                      ? new Date(gateway.lastSeenAt).toLocaleString()
                      : 'Never'}
                  </td>
                  <td>
                    {editingId === gateway.id ? (
                      <>
                        <button
                          onClick={() => saveEdit(gateway.id)}
                          style={{ marginRight: '0.5rem' }}
                        >
                          Save
                        </button>
                        <button onClick={cancelEdit}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => startEdit(gateway)}
                          style={{ marginRight: '0.5rem' }}
                        >
                          Edit
                        </button>
                        <button
                          className="danger"
                          onClick={() => deleteGateway(gateway.id)}
                        >
                          Delete
                        </button>
                      </>
                    )}
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

function ProvisioningBlock({ title, value }: { title: string; value: string }) {
  async function copy() {
    await navigator.clipboard?.writeText(value)
  }

  return (
    <div className="provisioning-block">
      <div className="provisioning-block-header">
        <span>{title}</span>
        <button type="button" className="secondary" onClick={copy}>Copy</button>
      </div>
      <pre>{value}</pre>
    </div>
  )
}
