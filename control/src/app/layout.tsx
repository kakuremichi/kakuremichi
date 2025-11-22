import type { Metadata } from 'next'

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
      <body>{children}</body>
    </html>
  )
}
