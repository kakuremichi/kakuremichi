export const dynamic = 'force-dynamic'

async function getStats() {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

  try {
    const [agents, gateways, tunnels] = await Promise.all([
      fetch(`${baseUrl}/api/agents`, { cache: 'no-store' }).then(r => r.json()),
      fetch(`${baseUrl}/api/gateways`, { cache: 'no-store' }).then(r => r.json()),
      fetch(`${baseUrl}/api/tunnels`, { cache: 'no-store' }).then(r => r.json()),
    ])

    return {
      agentsCount: agents.length,
      gatewaysCount: gateways.length,
      tunnelsCount: tunnels.length,
      activeTunnels: tunnels.filter((t: any) => t.enabled).length,
      onlineAgents: agents.filter((a: any) => a.status === 'online').length,
      onlineGateways: gateways.filter((g: any) => g.status === 'online').length,
    }
  } catch (error) {
    console.error('Failed to fetch stats:', error)
    return {
      agentsCount: 0,
      gatewaysCount: 0,
      tunnelsCount: 0,
      activeTunnels: 0,
      onlineAgents: 0,
      onlineGateways: 0,
    }
  }
}

export default async function Home() {
  const stats = await getStats()

  return (
    <div>
      <h1>Dashboard</h1>
      <p style={{ marginBottom: '2rem', color: '#666' }}>
        Welcome to kakuremichi - Self-hosted tunnel-based reverse proxy
      </p>

      <div className="stats">
        <div className="stat-card">
          <h3>Agents</h3>
          <div className="value">{stats.agentsCount}</div>
          <p style={{ fontSize: '0.875rem', color: '#666', marginTop: '0.5rem' }}>
            {stats.onlineAgents} online
          </p>
        </div>

        <div className="stat-card">
          <h3>Gateways</h3>
          <div className="value">{stats.gatewaysCount}</div>
          <p style={{ fontSize: '0.875rem', color: '#666', marginTop: '0.5rem' }}>
            {stats.onlineGateways} online
          </p>
        </div>

        <div className="stat-card">
          <h3>Tunnels</h3>
          <div className="value">{stats.tunnelsCount}</div>
          <p style={{ fontSize: '0.875rem', color: '#666', marginTop: '0.5rem' }}>
            {stats.activeTunnels} enabled
          </p>
        </div>
      </div>

      <div className="card">
        <h2>System Status</h2>
        <p style={{ color: '#047857', fontWeight: 600 }}>All systems operational</p>
        <p style={{ marginTop: '1rem', fontSize: '0.875rem', color: '#666' }}>
          Phase 1 Implementation Complete
        </p>
        <ul style={{ marginTop: '1rem', marginLeft: '1.5rem' }}>
          <li>REST API - Active</li>
          <li>WebSocket Server - Running on port 3001</li>
          <li>Database - SQLite</li>
          <li>SSL/TLS - ACME (Let&apos;s Encrypt) enabled</li>
        </ul>
      </div>

      <div className="card">
        <h2>Quick Actions</h2>
        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
          <a href="/agents"><button>Manage Agents</button></a>
          <a href="/gateways"><button>Manage Gateways</button></a>
          <a href="/tunnels"><button>Manage Tunnels</button></a>
        </div>
      </div>
    </div>
  )
}
