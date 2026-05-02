import { db, agents, gateways, tunnels } from '@/lib/db'

export const dynamic = 'force-dynamic'

async function getStats() {
  try {
    const [agentRows, gatewayRows, tunnelRows] = await Promise.all([
      db.select().from(agents),
      db.select().from(gateways),
      db.select().from(tunnels),
    ])

    return {
      agentsCount: agentRows.length,
      gatewaysCount: gatewayRows.length,
      tunnelsCount: tunnelRows.length,
      activeTunnels: tunnelRows.filter(t => t.enabled).length,
      onlineAgents: agentRows.filter(a => a.status === 'online').length,
      onlineGateways: gatewayRows.filter(g => g.status === 'online').length,
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
      <div className="page-heading">
        <p className="eyebrow">Overview</p>
        <h1>Dashboard</h1>
        <p className="page-subtitle">
          Monitor agents, gateways, public routes, and supporting control-plane services.
        </p>
      </div>

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
        <p className="health-line">All systems operational</p>
        <p className="muted-line">
          Phase 1 Implementation Complete
        </p>
        <ul className="system-list">
          <li>REST API - Active</li>
          <li>WebSocket Server - Running on port 3001</li>
          <li>Database - SQLite</li>
          <li>SSL/TLS - ACME (Let&apos;s Encrypt) enabled</li>
        </ul>
      </div>

      <div className="card">
        <h2>Quick Actions</h2>
        <div className="quick-actions">
          <a href="/agents"><button>Manage Agents</button></a>
          <a href="/gateways"><button>Manage Gateways</button></a>
          <a href="/tunnels"><button>Manage Tunnels</button></a>
          <a href="/settings/tokens"><button>API Tokens</button></a>
        </div>
      </div>
    </div>
  )
}
