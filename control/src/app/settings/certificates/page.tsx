'use client'

import { useEffect, useState } from 'react'

interface CertificateRow {
  id: string
  domain: string
  dnsZoneId: string | null
  dnsZoneName: string | null
  dnsProviderName: string | null
  dnsProviderType: string | null
  status: string
  notAfter: string | null
  renewAfter: string | null
  lastIssuedAt: string | null
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

export default function CertificatesPage() {
  const [certificates, setCertificates] = useState<CertificateRow[]>([])
  const [zones, setZones] = useState<DNSZoneRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [domain, setDomain] = useState('')
  const [dnsZoneId, setDnsZoneId] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    try {
      setError('')
      const [certificatesRes, zonesRes] = await Promise.all([
        fetch('/api/certificates'),
        fetch('/api/dns/zones'),
      ])
      if (!certificatesRes.ok || !zonesRes.ok) throw new Error('Failed to load certificates')
      setCertificates(await certificatesRes.json())
      setZones(await zonesRes.json())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load certificates')
    } finally {
      setLoading(false)
    }
  }

  async function createCertificate(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setMessage('')
    const res = await fetch('/api/certificates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain, dnsZoneId }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data.error || 'Failed to create certificate')
      return
    }
    setDomain('')
    setDnsZoneId('')
    setShowForm(false)
    setMessage('Certificate record created')
    fetchData()
  }

  async function issueCertificate(id: string) {
    setError('')
    setMessage('')
    const res = await fetch(`/api/certificates/${id}/issue`, { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data.error || 'Failed to issue certificate')
      fetchData()
      return
    }
    setMessage('Certificate issued')
    fetchData()
  }

  async function deleteCertificate(id: string) {
    if (!confirm('Delete this certificate record? Gateway copies will be removed on the next config push.')) return
    const res = await fetch(`/api/certificates/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Failed to delete certificate')
      return
    }
    fetchData()
  }

  function statusClass(status: string) {
    if (status === 'ready') return 'online'
    if (status === 'pending' || status === 'issuing' || status === 'renewal_due') return 'warning'
    return 'offline'
  }

  if (loading) return <div className="loading">Loading...</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1>Certificates</h1>
        <button onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : 'New Certificate'}
        </button>
      </div>

      <p style={{ color: '#666', marginBottom: '1rem' }}>
        Control-managed certificates use DNS-01 and can be served by multiple Gateways.
      </p>

      {error && <div className="error">{error}</div>}
      {message && (
        <div style={{ background: '#d1fae5', color: '#047857', padding: '1rem', borderRadius: '6px', marginBottom: '1rem' }}>
          {message}
        </div>
      )}

      {showForm && (
        <div className="card">
          <h2>Create Certificate</h2>
          <form onSubmit={createCertificate}>
            <div className="form-group">
              <label>Domain</label>
              <input value={domain} onChange={e => setDomain(e.target.value)} placeholder="app.example.com" required />
            </div>
            <div className="form-group">
              <label>DNS-01 Zone</label>
              <select value={dnsZoneId} onChange={e => setDnsZoneId(e.target.value)} required>
                <option value="">Select a zone</option>
                {zones.filter(zone => zone.enabled).map(zone => (
                  <option key={zone.id} value={zone.id}>
                    {zone.name} ({zone.providerName})
                  </option>
                ))}
              </select>
            </div>
            <button type="submit">Create Certificate</button>
          </form>
        </div>
      )}

      <div className="card">
        <h2>Certificate List ({certificates.length})</h2>
        {certificates.length === 0 ? (
          <p style={{ color: '#666' }}>No certificates yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Domain</th>
                <th>Status</th>
                <th>DNS Zone</th>
                <th>Expiry</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {certificates.map(certificate => (
                <tr key={certificate.id}>
                  <td><strong>{certificate.domain}</strong></td>
                  <td>
                    <span className={`status ${statusClass(certificate.status)}`}>
                      {certificate.status}
                    </span>
                    {certificate.lastError && (
                      <div style={{ color: '#b91c1c', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                        {certificate.lastError}
                      </div>
                    )}
                  </td>
                  <td style={{ color: '#666' }}>
                    {certificate.dnsZoneName
                      ? `${certificate.dnsZoneName} via ${certificate.dnsProviderName} (${certificate.dnsProviderType})`
                      : 'Not configured'}
                  </td>
                  <td style={{ color: '#666' }}>
                    {certificate.notAfter ? new Date(certificate.notAfter).toLocaleString() : 'Not issued'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="secondary" onClick={() => issueCertificate(certificate.id)}>
                        {certificate.status === 'ready' ? 'Renew' : 'Issue'}
                      </button>
                      <button className="danger" onClick={() => deleteCertificate(certificate.id)}>Delete</button>
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
