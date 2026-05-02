import type { Metadata } from 'next'
import '@xyflow/react/dist/style.css'
import './globals.css'
import { AuthGate } from './auth-gate'
import { AppShell } from './app-shell'

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
        <AppShell>
          <AuthGate>{children}</AuthGate>
        </AppShell>
      </body>
    </html>
  )
}
