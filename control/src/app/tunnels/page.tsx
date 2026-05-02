'use client'

import { useEffect, useState } from 'react'

interface GatewayIP {
  gatewayId: string
  gatewayName: string
  ip: string
}

interface Tunnel {
  id: string
  domain: string
  target: string
  agentId: string
  enabled: boolean
  subnet: string | null
  agentIp: string | null
  gatewayIps: GatewayIP[]
  httpProxyEnabled: boolean
  socksProxyEnabled: boolean
  dnsSync: {
    enabled: boolean
    recordType: string
    strategy: string
    ttl: number
    proxied: boolean
    lastSyncAt: string | null
    lastError: string | null
    zone: {
      id: string
      name: string
    }
    provider: {
      id: string
      name: string
      type: string
    }
  } | null
  tls: {
    mode: string
    forceHttps: boolean
    certificate: {
      id: string
      domain: string
      status: string
      notAfter: string | null
      renewAfter: string | null
      lastIssuedAt: string | null
      lastError: string | null
      dnsZoneId: string | null
    } | null
  }
  createdAt: string
  updatedAt: string
}

interface Agent {
  id: string
  name: string
}

interface DNSZone {
  id: string
  name: string
  providerName: string
  providerType: string
  enabled: boolean
}

export default function TunnelsPage() {
  const [tunnels, setTunnels] = useState<Tunnel[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [zones, setZones] = useState<DNSZone[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showNewForm, setShowNewForm] = useState(false)
  const [formData, setFormData] = useState({
    domain: '',
    target: '',
    agentId: '',
    httpProxyEnabled: false,
    socksProxyEnabled: false,
    dnsSyncEnabled: false,
    dnsZoneId: '',
    dnsStrategy: 'all_gateways',
    dnsTtl: '60',
    dnsProxied: false,
    tlsEnabled: false,
    tlsDnsZoneId: '',
    tlsForceHttps: true,
  })

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    try {
      const [tunnelsRes, agentsRes, zonesRes] = await Promise.all([
        fetch('/api/tunnels'),
        fetch('/api/agents'),
        fetch('/api/dns/zones'),
      ])

      if (!tunnelsRes.ok || !agentsRes.ok || !zonesRes.ok) throw new Error('Failed to fetch data')

      const tunnelsData = await tunnelsRes.json()
      const agentsData = await agentsRes.json()
      const zonesData = await zonesRes.json()

      setTunnels(tunnelsData)
      setAgents(agentsData)
      setZones(zonesData)
    } catch (err) {
      setError('Failed to load tunnels')
    } finally {
      setLoading(false)
    }
  }

  async function createTunnel() {
    if (!formData.domain || !formData.target || !formData.agentId) {
      alert('Please fill in all fields')
      return
    }

    try {
      const body: any = {
        domain: formData.domain,
        target: formData.target,
        agentId: formData.agentId,
        httpProxyEnabled: formData.httpProxyEnabled,
        socksProxyEnabled: formData.socksProxyEnabled,
      }
      if (formData.dnsSyncEnabled) {
        if (!formData.dnsZoneId) {
          alert('Please select a DNS zone')
          return
        }
        body.dnsSync = {
          enabled: true,
          zoneId: formData.dnsZoneId,
          recordType: 'A',
          strategy: formData.dnsStrategy,
          ttl: Number(formData.dnsTtl || 60),
          proxied: formData.dnsProxied,
        }
      }
      if (formData.tlsEnabled) {
        const dnsZoneId = formData.tlsDnsZoneId || formData.dnsZoneId
        if (!dnsZoneId) {
          alert('Please select a DNS zone for TLS')
          return
        }
        body.tls = {
          mode: 'auto',
          dnsZoneId,
          forceHttps: formData.tlsForceHttps,
        }
      }

      const res = await fetch('/api/tunnels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) throw new Error('Failed to create tunnel')

      setFormData({
        domain: '',
        target: '',
        agentId: '',
        httpProxyEnabled: false,
        socksProxyEnabled: false,
        dnsSyncEnabled: false,
        dnsZoneId: '',
        dnsStrategy: 'all_gateways',
        dnsTtl: '60',
        dnsProxied: false,
        tlsEnabled: false,
        tlsDnsZoneId: '',
        tlsForceHttps: true,
      })
      setShowNewForm(false)
      fetchData()
    } catch (err) {
      alert('Failed to create tunnel')
    }
  }

  async function toggleTunnel(id: string, enabled: boolean) {
    try {
      const res = await fetch(`/api/tunnels/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !enabled }),
      })

      if (!res.ok) throw new Error('Failed to toggle tunnel')
      fetchData()
    } catch (err) {
      alert('Failed to toggle tunnel')
    }
  }

  async function deleteTunnel(id: string) {
    if (!confirm('Are you sure you want to delete this tunnel?')) return

    try {
      const res = await fetch(`/api/tunnels/${id}`, {
        method: 'DELETE',
      })

      if (!res.ok) throw new Error('Failed to delete tunnel')
      fetchData()
    } catch (err) {
      alert('Failed to delete tunnel')
    }
  }

  async function syncDns(id: string) {
    try {
      const res = await fetch('/api/dns/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tunnelId: id }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to sync DNS')
      }
      fetchData()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to sync DNS')
    }
  }

  async function enableTls(tunnel: Tunnel) {
    const zoneId = tunnel.dnsSync?.zone.id || zones.find(zone => zone.enabled)?.id
    if (!zoneId) {
      alert('Import a DNS zone before enabling Control-managed TLS')
      return
    }
    try {
      const res = await fetch(`/api/tunnels/${tunnel.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tls: {
            mode: 'auto',
            dnsZoneId: zoneId,
            forceHttps: true,
          },
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to enable TLS')
      }
      fetchData()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to enable TLS')
    }
  }

  async function disableTls(tunnel: Tunnel) {
    try {
      const res = await fetch(`/api/tunnels/${tunnel.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tls: {
            mode: 'disabled',
            forceHttps: false,
          },
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to disable TLS')
      }
      fetchData()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to disable TLS')
    }
  }

  async function issueCertificate(certificateId: string) {
    try {
      const res = await fetch(`/api/certificates/${certificateId}/issue`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to issue certificate')
      }
      fetchData()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to issue certificate')
    }
  }

  function getAgentName(agentId: string) {
    const agent = agents.find(a => a.id === agentId)
    return agent ? agent.name : 'Unknown'
  }

  function certificateStatusClass(status?: string) {
    if (status === 'ready') return 'online'
    if (status === 'pending' || status === 'issuing' || status === 'renewal_due') return 'warning'
    return 'offline'
  }

  if (loading) return <div className="loading">Loading...</div>
  if (error) return <div className="error">{error}</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1>Tunnels</h1>
        <button onClick={() => setShowNewForm(!showNewForm)}>
          {showNewForm ? 'Cancel' : 'New Tunnel'}
        </button>
      </div>

      {showNewForm && (
        <div className="card" style={{ marginBottom: '2rem' }}>
          <h2>Create New Tunnel</h2>
          <div className="form-group">
            <label>Domain</label>
            <input
              type="text"
              value={formData.domain}
              onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
              placeholder="app.example.com"
            />
          </div>
          <div className="form-group">
            <label>Target</label>
            <input
              type="text"
              value={formData.target}
              onChange={(e) => setFormData({ ...formData, target: e.target.value })}
              placeholder="localhost:8080"
            />
          </div>
          <div className="form-group">
            <label>Agent</label>
            <select
              value={formData.agentId}
              onChange={(e) => setFormData({ ...formData, agentId: e.target.value })}
            >
              <option value="">Select an agent</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </div>
          <div style={{ marginTop: '1rem', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '0.875rem', marginBottom: '0.5rem', color: '#666' }}>Exit Node Settings</h3>
            <div style={{ display: 'flex', gap: '1.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.httpProxyEnabled}
                  onChange={(e) => setFormData({ ...formData, httpProxyEnabled: e.target.checked })}
                />
                <span>Enable HTTP Proxy (localhost:8080)</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.socksProxyEnabled}
                  onChange={(e) => setFormData({ ...formData, socksProxyEnabled: e.target.checked })}
                />
                <span>Enable SOCKS5 Proxy (localhost:1080)</span>
              </label>
            </div>
          </div>
          <div style={{ marginTop: '1rem', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '0.875rem', marginBottom: '0.5rem', color: '#666' }}>DNS Sync</h3>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: '1rem' }}>
              <input
                type="checkbox"
                checked={formData.dnsSyncEnabled}
                onChange={(e) => setFormData({ ...formData, dnsSyncEnabled: e.target.checked })}
              />
              <span>Keep this domain pointed at Gateway public IPs</span>
            </label>
            {formData.dnsSyncEnabled && (
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label>DNS Zone</label>
                  <select
                    value={formData.dnsZoneId}
                    onChange={(e) => setFormData({ ...formData, dnsZoneId: e.target.value })}
                  >
                    <option value="">Select a zone</option>
                    {zones.filter(zone => zone.enabled).map((zone) => (
                      <option key={zone.id} value={zone.id}>
                        {zone.name} ({zone.providerName})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Strategy</label>
                  <select
                    value={formData.dnsStrategy}
                    onChange={(e) => setFormData({ ...formData, dnsStrategy: e.target.value })}
                  >
                    <option value="all_gateways">All gateways</option>
                    <option value="online_gateways">Online gateways</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>TTL</label>
                  <input
                    type="number"
                    min={60}
                    max={86400}
                    value={formData.dnsTtl}
                    onChange={(e) => setFormData({ ...formData, dnsTtl: e.target.value })}
                  />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formData.dnsProxied}
                    onChange={(e) => setFormData({ ...formData, dnsProxied: e.target.checked })}
                  />
                  <span>Cloudflare proxied</span>
                </label>
              </div>
            )}
          </div>
          <div style={{ marginTop: '1rem', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '0.875rem', marginBottom: '0.5rem', color: '#666' }}>TLS</h3>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: '1rem' }}>
              <input
                type="checkbox"
                checked={formData.tlsEnabled}
                onChange={(e) => setFormData({ ...formData, tlsEnabled: e.target.checked })}
              />
              <span>Issue and serve a Control-managed HTTPS certificate</span>
            </label>
            {formData.tlsEnabled && (
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label>DNS-01 Zone</label>
                  <select
                    value={formData.tlsDnsZoneId || formData.dnsZoneId}
                    onChange={(e) => setFormData({ ...formData, tlsDnsZoneId: e.target.value })}
                  >
                    <option value="">Select a zone</option>
                    {zones.filter(zone => zone.enabled).map((zone) => (
                      <option key={zone.id} value={zone.id}>
                        {zone.name} ({zone.providerName})
                      </option>
                    ))}
                  </select>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginTop: '1.85rem' }}>
                  <input
                    type="checkbox"
                    checked={formData.tlsForceHttps}
                    onChange={(e) => setFormData({ ...formData, tlsForceHttps: e.target.checked })}
                  />
                  <span>Force HTTPS</span>
                </label>
              </div>
            )}
          </div>
          <button onClick={createTunnel}>Create Tunnel</button>
        </div>
      )}

      <div className="card">
        <h2>Tunnel List ({tunnels.length})</h2>
        {tunnels.length === 0 ? (
          <p style={{ color: '#666' }}>No tunnels yet. Create one to get started.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Domain</th>
                <th>Target</th>
                <th>Agent</th>
                <th>Network</th>
                <th>Exit Node</th>
                <th>DNS</th>
                <th>TLS</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tunnels.map((tunnel) => (
                <tr key={tunnel.id}>
                  <td><strong>{tunnel.domain}</strong></td>
                  <td><code>{tunnel.target}</code></td>
                  <td>{getAgentName(tunnel.agentId)}</td>
                  <td style={{ fontSize: '0.75rem' }}>
                    {tunnel.subnet ? (
                      <div>
                        <div><code>{tunnel.subnet}</code></div>
                        <div style={{ color: '#666' }}>
                          Agent: {tunnel.agentIp}
                        </div>
                        {tunnel.gatewayIps && tunnel.gatewayIps.length > 0 && (
                          <div style={{ color: '#666', marginTop: '4px' }}>
                            {tunnel.gatewayIps.map((gw) => (
                              <div key={gw.gatewayId}>
                                GW ({gw.gatewayName}): {gw.ip}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span style={{ color: '#999' }}>-</span>
                    )}
                  </td>
                  <td style={{ fontSize: '0.75rem' }}>
                    {(tunnel.httpProxyEnabled || tunnel.socksProxyEnabled) ? (
                      <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                        {tunnel.httpProxyEnabled && (
                          <span style={{
                            background: '#e3f2fd',
                            color: '#1565c0',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '0.7rem'
                          }}>HTTP</span>
                        )}
                        {tunnel.socksProxyEnabled && (
                          <span style={{
                            background: '#f3e5f5',
                            color: '#7b1fa2',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '0.7rem'
                          }}>SOCKS5</span>
                        )}
                      </div>
                    ) : (
                      <span style={{ color: '#999' }}>-</span>
                    )}
                  </td>
                  <td style={{ fontSize: '0.75rem' }}>
                    {tunnel.dnsSync ? (
                      <div>
                        <div>
                          <span className={`status ${tunnel.dnsSync.lastError ? 'offline' : 'online'}`}>
                            {tunnel.dnsSync.lastError ? 'Error' : 'Managed'}
                          </span>
                        </div>
                        <div style={{ color: '#666', marginTop: '0.25rem' }}>
                          {tunnel.dnsSync.zone.name} via {tunnel.dnsSync.provider.name}
                        </div>
                        <div style={{ color: '#666' }}>
                          {tunnel.dnsSync.lastSyncAt
                            ? `Last: ${new Date(tunnel.dnsSync.lastSyncAt).toLocaleString()}`
                            : 'Never synced'}
                        </div>
                        {tunnel.dnsSync.lastError && (
                          <div style={{ color: '#b91c1c', marginTop: '0.25rem' }}>
                            {tunnel.dnsSync.lastError}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span style={{ color: '#999' }}>Manual</span>
                    )}
                  </td>
                  <td style={{ fontSize: '0.75rem' }}>
                    {tunnel.tls?.mode === 'auto' && tunnel.tls.certificate ? (
                      <div>
                        <div>
                          <span className={`status ${certificateStatusClass(tunnel.tls.certificate.status)}`}>
                            {tunnel.tls.certificate.status}
                          </span>
                        </div>
                        <div style={{ color: '#666', marginTop: '0.25rem' }}>
                          {tunnel.tls.certificate.domain}
                        </div>
                        <div style={{ color: '#666' }}>
                          {tunnel.tls.certificate.notAfter
                            ? `Expires: ${new Date(tunnel.tls.certificate.notAfter).toLocaleDateString()}`
                            : 'Not issued'}
                        </div>
                        <div style={{ color: '#666' }}>
                          {tunnel.tls.forceHttps ? 'Force HTTPS' : 'HTTPS optional'}
                        </div>
                        {tunnel.tls.certificate.lastError && (
                          <div style={{ color: '#b91c1c', marginTop: '0.25rem' }}>
                            {tunnel.tls.certificate.lastError}
                          </div>
                        )}
                      </div>
                    ) : tunnel.tls?.mode === 'gateway_acme' ? (
                      <span className="status warning">Gateway ACME</span>
                    ) : (
                      <span style={{ color: '#999' }}>Disabled</span>
                    )}
                  </td>
                  <td>
                    <span className={`status ${tunnel.enabled ? 'online' : 'offline'}`}>
                      {tunnel.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        className="secondary"
                        onClick={() => toggleTunnel(tunnel.id, tunnel.enabled)}
                      >
                        {tunnel.enabled ? 'Disable' : 'Enable'}
                      </button>
                      {tunnel.dnsSync && (
                        <button
                          className="secondary"
                          onClick={() => syncDns(tunnel.id)}
                        >
                          Sync DNS
                        </button>
                      )}
                      {tunnel.tls?.mode === 'auto' && tunnel.tls.certificate ? (
                        <>
                          <button
                            className="secondary"
                            onClick={() => issueCertificate(tunnel.tls.certificate!.id)}
                          >
                            {tunnel.tls.certificate.status === 'ready' ? 'Renew TLS' : 'Issue TLS'}
                          </button>
                          <button
                            className="secondary"
                            onClick={() => disableTls(tunnel)}
                          >
                            Disable TLS
                          </button>
                        </>
                      ) : (
                        <button
                          className="secondary"
                          onClick={() => enableTls(tunnel)}
                        >
                          Enable TLS
                        </button>
                      )}
                      <button
                        className="danger"
                        onClick={() => deleteTunnel(tunnel.id)}
                      >
                        Delete
                      </button>
                    </div>
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
