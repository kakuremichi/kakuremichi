'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'

const PUBLIC_PATHS = ['/login', '/setup']

interface AuthUser {
  id: string
  email: string
  role: 'admin' | 'member'
  via: 'session' | 'token'
}

interface AuthContext {
  user: AuthUser | null
  ready: boolean
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname() || '/'
  const [ctx, setCtx] = useState<AuthContext>({ user: null, ready: false })

  useEffect(() => {
    let cancelled = false
    async function check() {
      try {
        const setupRes = await fetch('/api/auth/setup')
        if (setupRes.ok) {
          const data = await setupRes.json()
          if (data.needsSetup && pathname !== '/setup') {
            router.replace('/setup')
            return
          }
        }

        const res = await fetch('/api/auth/me')
        if (!res.ok) {
          if (!PUBLIC_PATHS.includes(pathname)) {
            router.replace('/login')
            return
          }
          if (!cancelled) setCtx({ user: null, ready: true })
          return
        }
        const user = await res.json()
        if (!cancelled) setCtx({ user, ready: true })

        if (PUBLIC_PATHS.includes(pathname)) {
          router.replace('/')
        }
      } catch {
        if (!cancelled) setCtx({ user: null, ready: true })
      }
    }
    check()
    return () => { cancelled = true }
  }, [pathname, router])

  if (PUBLIC_PATHS.includes(pathname)) {
    return <>{children}</>
  }

  if (!ctx.ready) {
    return <div className="loading" style={{ padding: '3rem', textAlign: 'center', color: '#666' }}>Loading…</div>
  }

  if (!ctx.user) {
    return null
  }

  return (
    <>
      <AuthBadge user={ctx.user} />
      {children}
    </>
  )
}

function AuthBadge({ user }: { user: AuthUser }) {
  const router = useRouter()
  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.replace('/login')
    router.refresh()
  }
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'flex-end',
        alignItems: 'center',
        gap: '1rem',
        padding: '0.5rem 0 1rem',
        color: '#666',
        fontSize: '0.875rem',
      }}
    >
      <span>{user.email} <em style={{ color: '#9ca3af' }}>({user.role})</em></span>
      <button onClick={logout} style={{ padding: '0.25rem 0.75rem' }}>Log out</button>
    </div>
  )
}
