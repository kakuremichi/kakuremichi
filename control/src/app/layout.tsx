import type { Metadata } from 'next'
import Link from 'next/link'
import './globals.css'

export const metadata: Metadata = {
  title: 'kakuremichi - Control Panel',
  description: 'Tunnel-based reverse proxy control panel',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <nav>
          <div className="container">
            <h1>kakuremichi</h1>
            <ul>
              <li><Link href="/">Dashboard</Link></li>
              <li><Link href="/agents">Agents</Link></li>
              <li><Link href="/gateways">Gateways</Link></li>
              <li><Link href="/tunnels">Tunnels</Link></li>
            </ul>
          </div>
        </nav>
        <main>
          <div className="container">
            {children}
          </div>
        </main>
      </body>
    </html>
  )
}
