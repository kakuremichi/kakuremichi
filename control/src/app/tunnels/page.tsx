'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

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
  agent?: {
    id: string
    name: string
    status: string
  } | null
  enabled: boolean
  subnet: string | null
  agentIp: string | null
  backends: TunnelBackend[]
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

interface TunnelBackend {
  id: string
  tunnelId: string
  agentId: string
  target: string
  enabled: boolean
  draining: boolean
  weight: number
  priority: number
  agentIp: string
  status: string
  lastError: string | null
  agent?: {
    id: string
    name: string
    status: string
  } | null
}

interface Agent {
  id: string
  name: string
  status?: string
}

interface Gateway {
  id: string
  name: string
  publicIp: string | null
  status: string
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
  const [gateways, setGateways] = useState<Gateway[]>([])
  const [zones, setZones] = useState<DNSZone[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showNewForm, setShowNewForm] = useState(false)
  const [selectedTunnelId, setSelectedTunnelId] = useState<string | null>(null)
  const [editingTargetId, setEditingTargetId] = useState<string | null>(null)
  const [targetDraft, setTargetDraft] = useState('')
  const [targetSaving, setTargetSaving] = useState(false)
  const [targetError, setTargetError] = useState('')
  const [editingExitId, setEditingExitId] = useState<string | null>(null)
  const [exitDraft, setExitDraft] = useState({
    httpProxyEnabled: false,
    socksProxyEnabled: false,
  })
  const [exitSaving, setExitSaving] = useState(false)
  const [exitError, setExitError] = useState('')
  const [showBackendForm, setShowBackendForm] = useState(false)
  const [editingBackendId, setEditingBackendId] = useState<string | null>(null)
  const [backendSaving, setBackendSaving] = useState(false)
  const [backendError, setBackendError] = useState('')
  const [backendDraft, setBackendDraft] = useState({
    agentId: '',
    target: '',
    enabled: true,
    draining: false,
    weight: '100',
    priority: '0',
  })
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

  const selectedTunnel = useMemo(() => {
    if (tunnels.length === 0) return null
    return tunnels.find(tunnel => tunnel.id === selectedTunnelId) ?? tunnels[0]
  }, [selectedTunnelId, tunnels])

  const metrics = useMemo(() => {
    const enabled = tunnels.filter(tunnel => tunnel.enabled).length
    const dnsManaged = tunnels.filter(tunnel => tunnel.dnsSync).length
    const tlsReady = tunnels.filter(tunnel => tunnel.tls?.certificate?.status === 'ready').length
    const exitEnabled = tunnels.filter(tunnel => tunnel.httpProxyEnabled || tunnel.socksProxyEnabled).length
    return { enabled, dnsManaged, tlsReady, exitEnabled }
  }, [tunnels])

  async function fetchData() {
    try {
      const [tunnelsRes, agentsRes, gatewaysRes, zonesRes] = await Promise.all([
        fetch('/api/tunnels'),
        fetch('/api/agents'),
        fetch('/api/gateways'),
        fetch('/api/dns/zones'),
      ])

      if (!tunnelsRes.ok || !agentsRes.ok || !gatewaysRes.ok || !zonesRes.ok) {
        throw new Error('Failed to fetch data')
      }

      const tunnelsData = await tunnelsRes.json()
      const agentsData = await agentsRes.json()
      const gatewaysData = await gatewaysRes.json()
      const zonesData = await zonesRes.json()

      setTunnels(tunnelsData)
      setAgents(agentsData)
      setGateways(gatewaysData)
      setZones(zonesData)
      setSelectedTunnelId(current => {
        if (current && tunnelsData.some((tunnel: Tunnel) => tunnel.id === current)) return current
        return tunnelsData[0]?.id ?? null
      })
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
      const body: {
        domain: string
        target: string
        agentId: string
        httpProxyEnabled: boolean
        socksProxyEnabled: boolean
        dnsSync?: {
          enabled: boolean
          zoneId: string
          recordType: string
          strategy: string
          ttl: number
          proxied: boolean
        }
        tls?: {
          mode: string
          dnsZoneId: string
          forceHttps: boolean
        }
      } = {
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

  function selectTunnel(id: string) {
    setSelectedTunnelId(id)
    setEditingTargetId(null)
    setTargetError('')
    setEditingExitId(null)
    setExitError('')
    cancelBackendEdit()
    setShowBackendForm(false)
  }

  function startTargetEdit(tunnel: Tunnel) {
    setEditingExitId(null)
    setExitError('')
    setEditingTargetId(tunnel.id)
    setTargetDraft(tunnel.target)
    setTargetError('')
  }

  function cancelTargetEdit() {
    setEditingTargetId(null)
    setTargetDraft('')
    setTargetError('')
  }

  function startExitEdit(tunnel: Tunnel) {
    setEditingTargetId(null)
    setTargetError('')
    setEditingExitId(tunnel.id)
    setExitDraft({
      httpProxyEnabled: tunnel.httpProxyEnabled,
      socksProxyEnabled: tunnel.socksProxyEnabled,
    })
    setExitError('')
  }

  function cancelExitEdit() {
    setEditingExitId(null)
    setExitDraft({ httpProxyEnabled: false, socksProxyEnabled: false })
    setExitError('')
  }

  function resetBackendDraft() {
    setBackendDraft({
      agentId: '',
      target: '',
      enabled: true,
      draining: false,
      weight: '100',
      priority: '0',
    })
  }

  function startBackendAdd() {
    setEditingTargetId(null)
    setEditingExitId(null)
    setBackendError('')
    resetBackendDraft()
    setShowBackendForm(true)
  }

  function startBackendEdit(backend: TunnelBackend) {
    setShowBackendForm(false)
    setBackendError('')
    setEditingBackendId(backend.id)
    setBackendDraft({
      agentId: backend.agentId,
      target: backend.target,
      enabled: backend.enabled,
      draining: backend.draining,
      weight: String(backend.weight),
      priority: String(backend.priority),
    })
  }

  function cancelBackendEdit() {
    setEditingBackendId(null)
    setBackendError('')
    resetBackendDraft()
  }

  function cancelBackendAdd() {
    setShowBackendForm(false)
    setBackendError('')
    resetBackendDraft()
  }

  async function updateTunnelTarget(tunnel: Tunnel) {
    const nextTarget = targetDraft.trim()
    if (!nextTarget) {
      setTargetError('Target is required')
      return
    }
    if (nextTarget === tunnel.target) {
      cancelTargetEdit()
      return
    }

    setTargetSaving(true)
    setTargetError('')
    try {
      const res = await fetch(`/api/tunnels/${tunnel.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: nextTarget }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const detail = Array.isArray(data.details) ? data.details[0]?.message : null
        throw new Error(detail || data.error || 'Failed to update target')
      }
      cancelTargetEdit()
      fetchData()
    } catch (err) {
      setTargetError(err instanceof Error ? err.message : 'Failed to update target')
    } finally {
      setTargetSaving(false)
    }
  }

  async function updateTunnelExit(tunnel: Tunnel) {
    const changed =
      exitDraft.httpProxyEnabled !== tunnel.httpProxyEnabled ||
      exitDraft.socksProxyEnabled !== tunnel.socksProxyEnabled

    if (!changed) {
      cancelExitEdit()
      return
    }

    setExitSaving(true)
    setExitError('')
    try {
      const res = await fetch(`/api/tunnels/${tunnel.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(exitDraft),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const detail = Array.isArray(data.details) ? data.details[0]?.message : null
        throw new Error(detail || data.error || 'Failed to update exit node')
      }
      cancelExitEdit()
      fetchData()
    } catch (err) {
      setExitError(err instanceof Error ? err.message : 'Failed to update exit node')
    } finally {
      setExitSaving(false)
    }
  }

  function backendPayload() {
    return {
      agentId: backendDraft.agentId,
      target: backendDraft.target.trim(),
      enabled: backendDraft.enabled,
      draining: backendDraft.draining,
      weight: Number(backendDraft.weight || 100),
      priority: Number(backendDraft.priority || 0),
    }
  }

  async function createBackend(tunnel: Tunnel) {
    const payload = backendPayload()
    if (!payload.agentId || !payload.target) {
      setBackendError('Agent and target are required')
      return
    }

    setBackendSaving(true)
    setBackendError('')
    try {
      const res = await fetch(`/api/tunnels/${tunnel.id}/backends`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const detail = Array.isArray(data.details) ? data.details[0]?.message : null
        throw new Error(detail || data.error || 'Failed to add backend')
      }
      cancelBackendAdd()
      fetchData()
    } catch (err) {
      setBackendError(err instanceof Error ? err.message : 'Failed to add backend')
    } finally {
      setBackendSaving(false)
    }
  }

  async function updateBackend(tunnel: Tunnel, backend: TunnelBackend) {
    const payload = backendPayload()
    if (!payload.agentId || !payload.target) {
      setBackendError('Agent and target are required')
      return
    }

    setBackendSaving(true)
    setBackendError('')
    try {
      const res = await fetch(`/api/tunnels/${tunnel.id}/backends/${backend.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const detail = Array.isArray(data.details) ? data.details[0]?.message : null
        throw new Error(detail || data.error || 'Failed to update backend')
      }
      cancelBackendEdit()
      fetchData()
    } catch (err) {
      setBackendError(err instanceof Error ? err.message : 'Failed to update backend')
    } finally {
      setBackendSaving(false)
    }
  }

  async function deleteBackend(tunnel: Tunnel, backend: TunnelBackend) {
    if (!confirm(`Delete backend ${backend.agentIp} -> ${backend.target}?`)) return

    setBackendSaving(true)
    setBackendError('')
    try {
      const res = await fetch(`/api/tunnels/${tunnel.id}/backends/${backend.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to delete backend')
      }
      cancelBackendEdit()
      fetchData()
    } catch (err) {
      setBackendError(err instanceof Error ? err.message : 'Failed to delete backend')
    } finally {
      setBackendSaving(false)
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

  function getAgentName(tunnel: Tunnel) {
    const backend = tunnel.backends?.[0]
    const agentId = backend?.agentId || tunnel.agentId
    const agent = agents.find(a => a.id === agentId)
    return backend?.agent?.name || tunnel.agent?.name || agent?.name || 'Unknown'
  }

  function getAgentStatus(tunnel: Tunnel) {
    const backend = tunnel.backends?.[0]
    const agentId = backend?.agentId || tunnel.agentId
    const agent = agents.find(a => a.id === agentId)
    return backend?.agent?.status || tunnel.agent?.status || agent?.status || 'unknown'
  }

  function getBackendAgentName(backend: TunnelBackend) {
    const agent = agents.find(a => a.id === backend.agentId)
    return backend.agent?.name || agent?.name || 'Unknown'
  }

  function getBackendAgentStatus(backend: TunnelBackend) {
    const agent = agents.find(a => a.id === backend.agentId)
    return backend.agent?.status || agent?.status || 'unknown'
  }

  function getGateway(gatewayId: string) {
    return gateways.find(gateway => gateway.id === gatewayId)
  }

  function certificateStatusClass(status?: string) {
    if (status === 'ready') return 'online'
    if (status === 'pending' || status === 'issuing' || status === 'renewal_due') return 'warning'
    return 'offline'
  }

  function dnsStatusClass(tunnel: Tunnel) {
    if (!tunnel.dnsSync) return 'neutral'
    return tunnel.dnsSync.lastError ? 'offline' : 'online'
  }

  function tlsLabel(tunnel: Tunnel) {
    const certificate = tunnel.tls?.certificate
    if (tunnel.tls?.mode === 'gateway_acme') return 'Gateway ACME'
    if (tunnel.tls?.mode !== 'auto' || !certificate) return 'Disabled'
    if (certificate.status === 'ready') return 'Ready'
    if (certificate.status === 'pending') return 'Issue required'
    return certificate.status
  }

  function formatDate(value: string | null, mode: 'date' | 'datetime' = 'datetime') {
    if (!value) return 'Never'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return 'Never'
    return mode === 'date' ? date.toLocaleDateString() : date.toLocaleString()
  }

  if (loading) return <div className="loading">Loading...</div>
  if (error) return <div className="error">{error}</div>

  return (
    <div className="tunnels-page">
      <div className="page-header-row">
        <div>
          <h1>Tunnels</h1>
          <p className="page-subtitle">Operate routes from public domains through Gateways to private Agent targets.</p>
        </div>
        <button onClick={() => setShowNewForm(!showNewForm)}>
          {showNewForm ? 'Cancel' : 'New Tunnel'}
        </button>
      </div>

      <div className="tunnel-metrics" aria-label="Tunnel summary">
        <Metric label="Total" value={tunnels.length} />
        <Metric label="Enabled" value={metrics.enabled} />
        <Metric label="DNS managed" value={metrics.dnsManaged} />
        <Metric label="TLS ready" value={metrics.tlsReady} />
        <Metric label="Exit proxy" value={metrics.exitEnabled} />
      </div>

      {showNewForm && (
        <div className="card tunnel-create-panel">
          <h2>Create New Tunnel</h2>
          <div className="tunnel-form-grid">
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
          </div>

          <div className="tunnel-form-options">
            <label className="check-row">
              <input
                type="checkbox"
                checked={formData.httpProxyEnabled}
                onChange={(e) => setFormData({ ...formData, httpProxyEnabled: e.target.checked })}
              />
              <span>HTTP exit proxy</span>
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={formData.socksProxyEnabled}
                onChange={(e) => setFormData({ ...formData, socksProxyEnabled: e.target.checked })}
              />
              <span>SOCKS5 exit proxy</span>
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={formData.dnsSyncEnabled}
                onChange={(e) => setFormData({ ...formData, dnsSyncEnabled: e.target.checked })}
              />
              <span>DNS sync</span>
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={formData.tlsEnabled}
                onChange={(e) => setFormData({ ...formData, tlsEnabled: e.target.checked })}
              />
              <span>Control-managed TLS</span>
            </label>
          </div>

          {(formData.dnsSyncEnabled || formData.tlsEnabled) && (
            <div className="tunnel-form-grid compact">
              {formData.dnsSyncEnabled && (
                <>
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
                </>
              )}
              {formData.tlsEnabled && (
                <>
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
                  <label className="check-row align-end">
                    <input
                      type="checkbox"
                      checked={formData.tlsForceHttps}
                      onChange={(e) => setFormData({ ...formData, tlsForceHttps: e.target.checked })}
                    />
                    <span>Force HTTPS after issue</span>
                  </label>
                </>
              )}
            </div>
          )}

          <button onClick={createTunnel}>Create Tunnel</button>
        </div>
      )}

      {tunnels.length === 0 ? (
        <div className="card">
          <p style={{ color: '#666' }}>No tunnels yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="tunnel-workbench">
          <section className="tunnel-list-panel" aria-label="Tunnel list">
            <div className="panel-heading">
              <h2>Tunnel List</h2>
              <span>{tunnels.length} routes</span>
            </div>
            <div className="tunnel-list">
              {tunnels.map((tunnel) => {
                const selected = selectedTunnel?.id === tunnel.id
                return (
                  <button
                    key={tunnel.id}
                    className={selected ? 'tunnel-list-item selected' : 'tunnel-list-item'}
                    onClick={() => selectTunnel(tunnel.id)}
                  >
                    <span className="tunnel-list-topline">
                      <strong>{tunnel.domain}</strong>
                      <span className={`status ${tunnel.enabled ? 'online' : 'offline'}`}>
                        {tunnel.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </span>
                    <span className="tunnel-list-meta">
                      {(tunnel.backends?.length || 1)} backend{(tunnel.backends?.length || 1) === 1 ? '' : 's'} to {tunnel.backends?.[0]?.target || tunnel.target}
                    </span>
                    <span className="tunnel-list-badges">
                      <span className={`mini-badge ${dnsStatusClass(tunnel)}`}>{tunnel.dnsSync ? 'DNS' : 'Manual DNS'}</span>
                      <span className={`mini-badge ${certificateStatusClass(tunnel.tls?.certificate?.status)}`}>
                        {tlsLabel(tunnel)}
                      </span>
                      {(tunnel.httpProxyEnabled || tunnel.socksProxyEnabled) && <span className="mini-badge neutral">Exit</span>}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>

          {selectedTunnel && (
            <section className="tunnel-detail-panel" aria-label="Tunnel detail">
              <div className="detail-header">
                <div>
                  <p className="eyebrow">Selected Tunnel</p>
                  <h2>{selectedTunnel.domain}</h2>
                  <p className="muted-line">{selectedTunnel.backends?.length || 1} backend route</p>
                </div>
                <span className={`status ${selectedTunnel.enabled ? 'online' : 'offline'}`}>
                  {selectedTunnel.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>

              <Topology
                tunnel={selectedTunnel}
                gateways={gateways}
                getGateway={getGateway}
                getBackendAgentName={getBackendAgentName}
                getBackendAgentStatus={getBackendAgentStatus}
              />

              <div className="detail-grid">
                <DetailSection title="Route">
                  <KeyValue label="Domain" value={selectedTunnel.domain} code />
                  <EditableTarget
                    tunnel={selectedTunnel}
                    editing={editingTargetId === selectedTunnel.id}
                    draft={targetDraft}
                    saving={targetSaving}
                    error={targetError}
                    onEdit={() => startTargetEdit(selectedTunnel)}
                    onChange={setTargetDraft}
                    onSave={() => updateTunnelTarget(selectedTunnel)}
                    onCancel={cancelTargetEdit}
                  />
                  <KeyValue label="Primary Agent" value={`${getAgentName(selectedTunnel)} (${getAgentStatus(selectedTunnel)})`} />
                  <KeyValue label="Created" value={formatDate(selectedTunnel.createdAt)} />
                </DetailSection>

                <DetailSection title="Network">
                  <KeyValue label="Subnet" value={selectedTunnel.subnet || 'Unassigned'} code={Boolean(selectedTunnel.subnet)} />
                  <KeyValue label="Backend IPs" value={`${selectedTunnel.backends?.length || 0}`} />
                  <KeyValue label="Gateway IPs" value={`${selectedTunnel.gatewayIps.length}`} />
                  <div className="gateway-ip-list">
                    {selectedTunnel.gatewayIps.map(gatewayIp => {
                      const gateway = getGateway(gatewayIp.gatewayId)
                      return (
                        <div key={gatewayIp.gatewayId}>
                          <span>{gatewayIp.gatewayName}</span>
                          <code>{gatewayIp.ip}</code>
                          <small>{gateway?.publicIp || 'no public IP'}</small>
                        </div>
                      )
                    })}
                  </div>
                </DetailSection>

                <DetailSection title="DNS">
                  {selectedTunnel.dnsSync ? (
                    <>
                      <KeyValue label="Mode" value={selectedTunnel.dnsSync.lastError ? 'Error' : 'Managed'} />
                      <KeyValue label="Zone" value={selectedTunnel.dnsSync.zone.name} />
                      <KeyValue label="Provider" value={`${selectedTunnel.dnsSync.provider.name} (${selectedTunnel.dnsSync.provider.type})`} />
                      <KeyValue label="Last sync" value={formatDate(selectedTunnel.dnsSync.lastSyncAt)} />
                      {selectedTunnel.dnsSync.lastError && <p className="detail-error">{selectedTunnel.dnsSync.lastError}</p>}
                    </>
                  ) : (
                    <p className="muted-line">Manual DNS. Control will not update records for this hostname.</p>
                  )}
                </DetailSection>

                <DetailSection title="TLS">
                  {selectedTunnel.tls?.mode === 'auto' && selectedTunnel.tls.certificate ? (
                    <>
                      <KeyValue label="Status" value={tlsLabel(selectedTunnel)} />
                      <KeyValue label="Certificate" value={selectedTunnel.tls.certificate.domain} />
                      <KeyValue label="Expires" value={selectedTunnel.tls.certificate.notAfter ? formatDate(selectedTunnel.tls.certificate.notAfter, 'date') : 'Not issued'} />
                      <KeyValue label="HTTPS policy" value={selectedTunnel.tls.forceHttps ? 'Force HTTPS' : 'Optional HTTPS'} />
                      {selectedTunnel.tls.certificate.lastError && <p className="detail-error">{selectedTunnel.tls.certificate.lastError}</p>}
                    </>
                  ) : selectedTunnel.tls?.mode === 'gateway_acme' ? (
                    <p className="muted-line">Gateway-managed ACME is configured for this route.</p>
                  ) : (
                    <p className="muted-line">TLS is disabled for this route.</p>
                  )}
                </DetailSection>

                <DetailSection title="Backends" className="backends-section">
                  <BackendSettings
                    tunnel={selectedTunnel}
                    agents={agents}
                    editingBackendId={editingBackendId}
                    showAddForm={showBackendForm}
                    draft={backendDraft}
                    saving={backendSaving}
                    error={backendError}
                    getBackendAgentName={getBackendAgentName}
                    getBackendAgentStatus={getBackendAgentStatus}
                    onAdd={startBackendAdd}
                    onEdit={startBackendEdit}
                    onDraftChange={setBackendDraft}
                    onCreate={() => createBackend(selectedTunnel)}
                    onUpdate={(backend) => updateBackend(selectedTunnel, backend)}
                    onDelete={(backend) => deleteBackend(selectedTunnel, backend)}
                    onCancelEdit={cancelBackendEdit}
                    onCancelAdd={cancelBackendAdd}
                  />
                </DetailSection>

                <DetailSection title="Exit Node">
                  <EditableExitSettings
                    tunnel={selectedTunnel}
                    editing={editingExitId === selectedTunnel.id}
                    draft={exitDraft}
                    saving={exitSaving}
                    error={exitError}
                    onEdit={() => startExitEdit(selectedTunnel)}
                    onChange={setExitDraft}
                    onSave={() => updateTunnelExit(selectedTunnel)}
                    onCancel={cancelExitEdit}
                  />
                </DetailSection>
              </div>

              <div className="detail-actions">
                <button
                  className="secondary"
                  onClick={() => toggleTunnel(selectedTunnel.id, selectedTunnel.enabled)}
                >
                  {selectedTunnel.enabled ? 'Disable' : 'Enable'}
                </button>
                {selectedTunnel.dnsSync && (
                  <button className="secondary" onClick={() => syncDns(selectedTunnel.id)}>
                    Sync DNS
                  </button>
                )}
                {selectedTunnel.tls?.mode === 'auto' && selectedTunnel.tls.certificate ? (
                  <>
                    <button
                      className="secondary"
                      onClick={() => issueCertificate(selectedTunnel.tls.certificate!.id)}
                    >
                      {selectedTunnel.tls.certificate.status === 'ready' ? 'Renew TLS' : 'Issue TLS'}
                    </button>
                    <button className="secondary" onClick={() => disableTls(selectedTunnel)}>
                      Disable TLS
                    </button>
                  </>
                ) : (
                  <button className="secondary" onClick={() => enableTls(selectedTunnel)}>
                    Enable TLS
                  </button>
                )}
                <button className="danger" onClick={() => deleteTunnel(selectedTunnel.id)}>
                  Delete
                </button>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="tunnel-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function Topology({
  tunnel,
  gateways,
  getGateway,
  getBackendAgentName,
  getBackendAgentStatus,
}: {
  tunnel: Tunnel
  gateways: Gateway[]
  getGateway: (gatewayId: string) => Gateway | undefined
  getBackendAgentName: (backend: TunnelBackend) => string
  getBackendAgentStatus: (backend: TunnelBackend) => string
}) {
  const gatewayNodes = tunnel.gatewayIps.length > 0
    ? tunnel.gatewayIps
    : gateways.map(gateway => ({ gatewayId: gateway.id, gatewayName: gateway.name, ip: 'unassigned' }))
  const backendNodes = tunnel.backends?.length > 0
    ? tunnel.backends
    : [{
      id: tunnel.id,
      tunnelId: tunnel.id,
      agentId: tunnel.agentId,
      target: tunnel.target,
      enabled: tunnel.enabled,
      draining: false,
      weight: 100,
      priority: 0,
      agentIp: tunnel.agentIp || 'No agent IP',
      status: 'unknown',
      lastError: null,
      agent: tunnel.agent,
    }]

  return (
    <div className="topology-map" aria-label="Tunnel topology">
      <div className="topology-node source">
        <span>Client</span>
        <strong>Public request</strong>
        <small>{tunnel.domain}</small>
      </div>
      <div className="topology-edge" />
      <div className="topology-gateway-stack">
        {gatewayNodes.map(gatewayIp => {
          const gateway = getGateway(gatewayIp.gatewayId)
          return (
            <div key={gatewayIp.gatewayId} className="topology-node gateway">
              <span>{gatewayIp.gatewayName}</span>
              <strong>{gateway?.publicIp || 'No public IP'}</strong>
              <small>{gatewayIp.ip}</small>
            </div>
          )
        })}
      </div>
      <div className="topology-edge" />
      <div className="topology-node balancer">
        <span>Policy</span>
        <strong>Weighted RR</strong>
        <small>priority, drain, health</small>
      </div>
      <div className="topology-edge" />
      <div className="topology-backend-stack">
        {backendNodes.map(backend => (
          <div key={backend.id} className={backend.enabled && !backend.draining ? 'topology-node agent' : 'topology-node agent muted'}>
            <span>{getBackendAgentName(backend)} {'->'} {backend.target}</span>
            <strong>{backend.agentIp}</strong>
            <small>w{backend.weight} / p{backend.priority} / {backend.draining ? 'drain' : getBackendAgentStatus(backend)}</small>
          </div>
        ))}
      </div>
    </div>
  )
}

function DetailSection({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={className ? `detail-section ${className}` : 'detail-section'}>
      <h3>{title}</h3>
      {children}
    </section>
  )
}

function KeyValue({ label, value, code = false }: { label: string; value: string; code?: boolean }) {
  return (
    <div className="key-value">
      <span>{label}</span>
      {code ? <code>{value}</code> : <strong>{value}</strong>}
    </div>
  )
}

function BackendSettings({
  tunnel,
  agents,
  editingBackendId,
  showAddForm,
  draft,
  saving,
  error,
  getBackendAgentName,
  getBackendAgentStatus,
  onAdd,
  onEdit,
  onDraftChange,
  onCreate,
  onUpdate,
  onDelete,
  onCancelEdit,
  onCancelAdd,
}: {
  tunnel: Tunnel
  agents: Agent[]
  editingBackendId: string | null
  showAddForm: boolean
  draft: {
    agentId: string
    target: string
    enabled: boolean
    draining: boolean
    weight: string
    priority: string
  }
  saving: boolean
  error: string
  getBackendAgentName: (backend: TunnelBackend) => string
  getBackendAgentStatus: (backend: TunnelBackend) => string
  onAdd: () => void
  onEdit: (backend: TunnelBackend) => void
  onDraftChange: (draft: {
    agentId: string
    target: string
    enabled: boolean
    draining: boolean
    weight: string
    priority: string
  }) => void
  onCreate: () => void
  onUpdate: (backend: TunnelBackend) => void
  onDelete: (backend: TunnelBackend) => void
  onCancelEdit: () => void
  onCancelAdd: () => void
}) {
  return (
    <div className="backend-settings">
      <div className="backend-toolbar">
        <span>{tunnel.backends.length} backend{tunnel.backends.length === 1 ? '' : 's'}</span>
        <button type="button" className="secondary compact-button" onClick={onAdd}>
          Add Backend
        </button>
      </div>

      {showAddForm && (
        <BackendForm
          agents={agents}
          draft={draft}
          saving={saving}
          submitLabel="Add"
          onDraftChange={onDraftChange}
          onSubmit={onCreate}
          onCancel={onCancelAdd}
        />
      )}

      <div className="backend-list">
        {tunnel.backends.map((backend) => (
          <div key={backend.id} className="backend-row">
            {editingBackendId === backend.id ? (
              <BackendForm
                agents={agents}
                draft={draft}
                saving={saving}
                submitLabel="Save"
                onDraftChange={onDraftChange}
                onSubmit={() => onUpdate(backend)}
                onCancel={onCancelEdit}
              />
            ) : (
              <>
                <div className="backend-main">
                  <span>{getBackendAgentName(backend)}</span>
                  <code>{backend.agentIp}</code>
                  <strong>{backend.target}</strong>
                </div>
                <div className="backend-meta">
                  <span className={`mini-badge ${backend.enabled ? 'online' : 'offline'}`}>
                    {backend.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                  {backend.draining && <span className="mini-badge warning">Draining</span>}
                  <span className="mini-badge neutral">w{backend.weight}</span>
                  <span className="mini-badge neutral">p{backend.priority}</span>
                  <span className={`mini-badge ${getBackendAgentStatus(backend) === 'online' ? 'online' : 'offline'}`}>
                    {getBackendAgentStatus(backend)}
                  </span>
                </div>
                <div className="backend-actions">
                  <button type="button" className="secondary compact-button" onClick={() => onEdit(backend)}>
                    Edit
                  </button>
                  <button type="button" className="danger compact-button" onClick={() => onDelete(backend)}>
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
      {error && <p className="detail-error compact">{error}</p>}
    </div>
  )
}

function BackendForm({
  agents,
  draft,
  saving,
  submitLabel,
  onDraftChange,
  onSubmit,
  onCancel,
}: {
  agents: Agent[]
  draft: {
    agentId: string
    target: string
    enabled: boolean
    draining: boolean
    weight: string
    priority: string
  }
  saving: boolean
  submitLabel: string
  onDraftChange: (draft: {
    agentId: string
    target: string
    enabled: boolean
    draining: boolean
    weight: string
    priority: string
  }) => void
  onSubmit: () => void
  onCancel: () => void
}) {
  return (
    <form
      className="backend-form"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <select
        value={draft.agentId}
        disabled={saving}
        onChange={(event) => onDraftChange({ ...draft, agentId: event.target.value })}
      >
        <option value="">Agent</option>
        {agents.map((agent) => (
          <option key={agent.id} value={agent.id}>
            {agent.name}
          </option>
        ))}
      </select>
      <input
        type="text"
        value={draft.target}
        placeholder="localhost:8080"
        disabled={saving}
        onChange={(event) => onDraftChange({ ...draft, target: event.target.value })}
      />
      <input
        type="number"
        min={1}
        max={10000}
        value={draft.weight}
        aria-label="Weight"
        disabled={saving}
        onChange={(event) => onDraftChange({ ...draft, weight: event.target.value })}
      />
      <input
        type="number"
        min={0}
        max={1000}
        value={draft.priority}
        aria-label="Priority"
        disabled={saving}
        onChange={(event) => onDraftChange({ ...draft, priority: event.target.value })}
      />
      <label className="check-row compact-check">
        <input
          type="checkbox"
          checked={draft.enabled}
          disabled={saving}
          onChange={(event) => onDraftChange({ ...draft, enabled: event.target.checked })}
        />
        <span>Enabled</span>
      </label>
      <label className="check-row compact-check">
        <input
          type="checkbox"
          checked={draft.draining}
          disabled={saving}
          onChange={(event) => onDraftChange({ ...draft, draining: event.target.checked })}
        />
        <span>Drain</span>
      </label>
      <div className="target-edit-actions">
        <button type="submit" disabled={saving}>
          {saving ? 'Saving...' : submitLabel}
        </button>
        <button type="button" className="secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  )
}

function EditableTarget({
  tunnel,
  editing,
  draft,
  saving,
  error,
  onEdit,
  onChange,
  onSave,
  onCancel,
}: {
  tunnel: Tunnel
  editing: boolean
  draft: string
  saving: boolean
  error: string
  onEdit: () => void
  onChange: (value: string) => void
  onSave: () => void
  onCancel: () => void
}) {
  if (editing) {
    return (
      <div className="key-value editable-key-value">
        <label htmlFor={`target-${tunnel.id}`}>Target</label>
        <form
          className="target-edit-form"
          onSubmit={(event) => {
            event.preventDefault()
            onSave()
          }}
        >
          <input
            id={`target-${tunnel.id}`}
            type="text"
            value={draft}
            onChange={(event) => onChange(event.target.value)}
            placeholder="localhost:8080"
            disabled={saving}
          />
          <div className="target-edit-actions">
            <button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button type="button" className="secondary" onClick={onCancel} disabled={saving}>
              Cancel
            </button>
          </div>
          {error && <p className="detail-error compact">{error}</p>}
        </form>
      </div>
    )
  }

  return (
    <div className="key-value editable-key-value">
      <span>Target</span>
      <div className="target-read-row">
        <code>{tunnel.target}</code>
        <button type="button" className="secondary compact-button" onClick={onEdit}>
          Edit
        </button>
      </div>
    </div>
  )
}

function EditableExitSettings({
  tunnel,
  editing,
  draft,
  saving,
  error,
  onEdit,
  onChange,
  onSave,
  onCancel,
}: {
  tunnel: Tunnel
  editing: boolean
  draft: { httpProxyEnabled: boolean; socksProxyEnabled: boolean }
  saving: boolean
  error: string
  onEdit: () => void
  onChange: (value: { httpProxyEnabled: boolean; socksProxyEnabled: boolean }) => void
  onSave: () => void
  onCancel: () => void
}) {
  if (editing) {
    return (
      <form
        className="exit-edit-form"
        onSubmit={(event) => {
          event.preventDefault()
          onSave()
        }}
      >
        <label className="check-row exit-check-row">
          <input
            type="checkbox"
            checked={draft.httpProxyEnabled}
            disabled={saving}
            onChange={(event) => onChange({ ...draft, httpProxyEnabled: event.target.checked })}
          />
          <span>HTTP localhost:8080</span>
        </label>
        <label className="check-row exit-check-row">
          <input
            type="checkbox"
            checked={draft.socksProxyEnabled}
            disabled={saving}
            onChange={(event) => onChange({ ...draft, socksProxyEnabled: event.target.checked })}
          />
          <span>SOCKS5 localhost:1080</span>
        </label>
        <div className="target-edit-actions">
          <button type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button type="button" className="secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        </div>
        {error && <p className="detail-error compact">{error}</p>}
      </form>
    )
  }

  return (
    <div className="exit-read-panel">
      <div className="protocol-list">
        <span className={tunnel.httpProxyEnabled ? 'protocol enabled' : 'protocol'}>HTTP localhost:8080</span>
        <span className={tunnel.socksProxyEnabled ? 'protocol enabled' : 'protocol'}>SOCKS5 localhost:1080</span>
      </div>
      <button type="button" className="secondary compact-button" onClick={onEdit}>
        Edit
      </button>
    </div>
  )
}
