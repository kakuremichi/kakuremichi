'use client'

import { useEffect, useState } from 'react'

interface Agent {
  id: string
  name: string
  apiKeyPrefix: string | null
  wireguardPublicKey: string | null
  status: string
  lastSeenAt: string | null
  createdAt: string
}

interface CreatedAgentCredential {
  name: string
  apiKey: string
  connection: ControlConnectionConfig
}

interface ControlConnectionConfig {
  controlBaseUrl: string
  websocketUrl: string
  wsPath: string
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showNewForm, setShowNewForm] = useState(false)
  const [newAgentName, setNewAgentName] = useState('')
  const [createdCredential, setCreatedCredential] = useState<CreatedAgentCredential | null>(null)
  const [connectionConfig, setConnectionConfig] = useState<ControlConnectionConfig | null>(null)

  useEffect(() => {
    fetchAgents()
    fetchConnectionConfig()
  }, [])

  async function fetchAgents() {
    try {
      const res = await fetch('/api/agents')
      if (!res.ok) throw new Error('Failed to fetch agents')
      const data = await res.json()
      setAgents(data)
    } catch (err) {
      setError('Failed to load agents')
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

  async function createAgent() {
    if (!newAgentName.trim()) {
      alert('Please enter agent name')
      return
    }

    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newAgentName }),
      })

      if (!res.ok) throw new Error('Failed to create agent')
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
      setNewAgentName('')
      setShowNewForm(false)
      fetchAgents()
    } catch (err) {
      alert('Failed to create agent')
    }
  }

  async function deleteAgent(id: string) {
    if (!confirm('Are you sure you want to delete this agent?')) return

    try {
      const res = await fetch(`/api/agents/${id}`, {
        method: 'DELETE',
      })

      if (!res.ok) throw new Error('Failed to delete agent')
      fetchAgents()
    } catch (err) {
      alert('Failed to delete agent')
    }
  }

  if (loading) return <div className="loading">Loading...</div>
  if (error) return <div className="error">{error}</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1>Agents</h1>
        <button onClick={() => setShowNewForm(!showNewForm)}>
          {showNewForm ? 'Cancel' : 'New Agent'}
        </button>
      </div>

      {createdCredential && (
        <div className="card" style={{ marginBottom: '2rem', borderLeft: '4px solid #f59e0b' }}>
          <h2>New Agent Connection</h2>
          <p style={{ color: '#92400e', marginBottom: '1rem' }}>
            Save this key now. It is shown only after creation.
          </p>
          <p style={{ color: '#666', marginBottom: '0.5rem' }}>{createdCredential.name}</p>
          <code style={{ display: 'block', padding: '0.75rem', background: '#f3f4f6', wordBreak: 'break-all' }}>
            {createdCredential.apiKey}
          </code>
          <div className="provisioning-grid" style={{ marginTop: '1rem' }}>
            <ProvisioningBlock
              title="agent.env"
              value={[
                `CONTROL_URL=${createdCredential.connection.websocketUrl}`,
                `API_KEY=${createdCredential.apiKey}`,
              ].join('\n')}
            />
            <ProvisioningBlock
              title="Run command"
              value={[
                './agent',
                `--control-url=${createdCredential.connection.websocketUrl}`,
                `--api-key=${createdCredential.apiKey}`,
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
          <h2>Agent connection template</h2>
          <p className="muted-line">New Agents will connect to <code>{connectionConfig.websocketUrl}</code>.</p>
        </div>
      )}

      {showNewForm && (
        <div className="card" style={{ marginBottom: '2rem' }}>
          <h2>Create New Agent</h2>
          <div className="form-group">
            <label>Agent Name</label>
            <input
              type="text"
              value={newAgentName}
              onChange={(e) => setNewAgentName(e.target.value)}
              placeholder="my-agent"
            />
          </div>
          <button onClick={createAgent}>Create Agent</button>
        </div>
      )}

      <div className="card">
        <h2>Agent List ({agents.length})</h2>
        {agents.length === 0 ? (
          <p style={{ color: '#666' }}>No agents yet. Create one to get started.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>API Key</th>
                <th>Last Seen</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => (
                <tr key={agent.id}>
                  <td><strong>{agent.name}</strong></td>
                  <td>
                    <span className={`status ${agent.status}`}>
                      {agent.status}
                    </span>
                  </td>
                  <td>
                    <code style={{ fontSize: '0.75rem' }}>
                      {agent.apiKeyPrefix ? `${agent.apiKeyPrefix}...` : '-'}
                    </code>
                  </td>
                  <td style={{ fontSize: '0.875rem', color: '#666' }}>
                    {agent.lastSeenAt
                      ? new Date(agent.lastSeenAt).toLocaleString()
                      : 'Never'}
                  </td>
                  <td>
                    <button
                      className="danger"
                      onClick={() => deleteAgent(agent.id)}
                    >
                      Delete
                    </button>
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
