'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

const publicPaths = ['/login', '/setup']

const navItems = [
  { href: '/', label: 'Dashboard', description: 'Overview' },
  { href: '/agents', label: 'Agents', description: 'Origins' },
  { href: '/gateways', label: 'Gateways', description: 'Edge nodes' },
  { href: '/tunnels', label: 'Tunnels', description: 'Routes' },
  { href: '/settings/dns', label: 'DNS', description: 'Sync' },
  { href: '/settings/certificates', label: 'Certificates', description: 'TLS' },
  { href: '/settings/tokens', label: 'Tokens', description: 'API access' },
]

function isActivePath(pathname: string, href: string) {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || '/'
  const isPublic = publicPaths.includes(pathname)

  if (isPublic) {
    return (
      <div className="public-shell">
        <aside className="public-brand-panel">
          <Link href="/" className="brand-lockup" aria-label="kakuremichi dashboard">
            <span className="brand-mark">K</span>
            <span>
              <strong>kakuremichi</strong>
              <small>Control plane</small>
            </span>
          </Link>
          <div className="public-brand-copy">
            <p className="eyebrow">Self-hosted tunnel operations</p>
            <h1>Secure routes, gateways, and agents from one console.</h1>
            <p>
              Manage reverse proxy tunnels, WireGuard peers, DNS sync, and API access
              without exposing private services directly.
            </p>
          </div>
        </aside>
        <main className="public-main">{children}</main>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/" className="brand-lockup" aria-label="kakuremichi dashboard">
          <span className="brand-mark">K</span>
          <span>
            <strong>kakuremichi</strong>
            <small>Control plane</small>
          </span>
        </Link>

        <nav className="sidebar-nav" aria-label="Primary navigation">
          <p className="nav-label">Operations</p>
          <ul className="nav-list">
            {navItems.map((item) => {
              const active = isActivePath(pathname, item.href)
              return (
                <li key={item.href}>
                  <Link className={active ? 'nav-link active' : 'nav-link'} href={item.href}>
                    <span className="nav-link-title">{item.label}</span>
                    <span className="nav-link-description">{item.description}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="sidebar-footer">
          <span className="status-dot" aria-hidden="true" />
          <span>Local-first control</span>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Control Panel</p>
            <h1>Network Operations</h1>
          </div>
          <div className="topbar-actions">
            <span className="env-pill">self-hosted</span>
          </div>
        </header>
        <main className="app-content">{children}</main>
      </div>
    </div>
  )
}
