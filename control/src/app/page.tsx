export default function Home() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>kakuremichi Control Panel</h1>
      <p>Welcome to kakuremichi - Self-hosted tunnel-based reverse proxy</p>

      <div style={{ marginTop: '2rem' }}>
        <h2>Status</h2>
        <p>Phase 1 Implementation (Basic Architecture)</p>

        <h2>Quick Links</h2>
        <ul>
          <li>
            <a href="/api/agents">Agents API</a>
          </li>
          <li>
            <a href="/api/gateways">Gateways API</a>
          </li>
          <li>
            <a href="/api/tunnels">Tunnels API</a>
          </li>
        </ul>

        <h2>Next Steps</h2>
        <ul>
          <li>Implement WireGuard integration</li>
          <li>Implement HTTP reverse proxy</li>
          <li>Implement WebSocket communication</li>
          <li>Build Web UI</li>
        </ul>
      </div>
    </main>
  )
}
