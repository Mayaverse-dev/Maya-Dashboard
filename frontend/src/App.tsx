import { useEffect, useState, type FormEvent } from 'react'
import EbookStats from './pages/EbookStats'
import './App.css'

type VerifyResponse = {
  ok: boolean
  sub?: string
  exp?: number
}

function deriveServiceSuffix(): string | null {
  // For a.meme.entermaya.com, b.meme.entermaya.com, metrics.meme.entermaya.com, etc.
  // We want the shared suffix: meme.entermaya.com
  const host = window.location.hostname
  if (host === 'localhost' || host === '127.0.0.1') return null

  const parts = host.split('.').filter(Boolean)
  if (parts.length < 3) return null
  return parts.slice(-3).join('.')
}

type InternalCard = {
  kind: 'internal'
  title: string
  description: string
  path: string
  badge?: string
}

type ExternalCard = {
  kind: 'external'
  title: string
  description: string
  subdomain: string
  badge?: string
}

type CardSpec = InternalCard | ExternalCard

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    credentials: 'include',
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    const message = text || `Request failed (${res.status})`
    throw new Error(message)
  }

  return (await res.json()) as T
}

function formatExp(exp?: number) {
  if (!exp) return 'n/a'
  try {
    return new Date(exp * 1000).toLocaleString()
  } catch {
    return 'n/a'
  }
}

function App() {
  const [auth, setAuth] = useState<'checking' | 'authed' | 'not_authed'>('checking')
  const [session, setSession] = useState<VerifyResponse | null>(null)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentPath, setCurrentPath] = useState(() => window.location.pathname)

  const cards: CardSpec[] = [
    {
      kind: 'internal',
      title: 'eBook Stats',
      description: 'Downloads, formats, event types, and top countries.',
      path: '/ebook',
      badge: 'Metrics',
    },
    // External cards will be added later.
  ]

  useEffect(() => {
    const onPopState = () => setCurrentPath(window.location.pathname)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  function navigate(path: string) {
    if (path === window.location.pathname) return
    window.history.pushState({}, '', path)
    setCurrentPath(path)
  }

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        const v = await apiFetch<VerifyResponse>('/api/verify')
        if (cancelled) return
        setSession(v)
        setAuth('authed')
      } catch {
        if (cancelled) return
        setSession(null)
        setAuth('not_authed')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  async function onLogin(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await apiFetch<{ ok: boolean }>('/api/login', {
        method: 'POST',
        body: JSON.stringify({ password }),
      })
      const v = await apiFetch<VerifyResponse>('/api/verify')
      setSession(v)
      setAuth('authed')
      setPassword('')
    } catch (err) {
      setSession(null)
      setAuth('not_authed')
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  async function onLogout() {
    setBusy(true)
    setError(null)
    try {
      await apiFetch<{ ok: boolean }>('/api/logout', { method: 'POST' })
    } catch {
      // Even if logout fails, clear local state.
    } finally {
      setSession(null)
      setAuth('not_authed')
      setBusy(false)
    }
  }

  const isEbookPage = currentPath === '/ebook'

  return (
    <div className="page bgMayaGradient">
      <div className="noiseOverlay" aria-hidden="true" />
      <div className="blob a animateFloat" aria-hidden="true" />
      <div className="blob b animateFloat" aria-hidden="true" />
      <div className="blob c animateFloat" aria-hidden="true" />

      {auth !== 'authed' ? (
        <div className="container">
          <div className="centerStage">
            <div className="loginCard glassCard card animateFadeInUp">
              <h1 className="enterTitle textGlow">ENTER</h1>

              <div className="logoMark" aria-hidden="true">
                <svg viewBox="0 0 96 96" width="86" height="86" role="img" aria-label="Maya">
                  <defs>
                    <radialGradient id="rg" cx="30%" cy="30%" r="80%">
                      <stop offset="0%" stopColor="rgba(222,1,54,0.55)" />
                      <stop offset="55%" stopColor="rgba(222,1,54,0.18)" />
                      <stop offset="100%" stopColor="rgba(222,1,54,0)" />
                    </radialGradient>
                  </defs>
                  <circle cx="48" cy="48" r="40" fill="rgba(250,248,216,0.04)" stroke="rgba(250,248,216,0.12)" />
                  <circle cx="48" cy="48" r="40" fill="url(#rg)" />
                  <path
                    d="M28 62V34h6.6l12.2 15.7L59 34H66v28h-6.8V45.2L46.8 60.8 34.7 45.3V62H28z"
                    fill="rgba(250,248,216,0.92)"
                  />
                </svg>
              </div>

              <div className="subtle">Enter the shared password to view metrics.</div>

              <form onSubmit={onLogin}>
                <div className="loginRow">
                  <input
                    className="passwordInput inputDark"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    autoFocus
                  />
                  <button className="btn btnPrimary" type="submit" disabled={busy || password.trim().length === 0}>
                    {busy ? '...' : 'Enter'}
                  </button>
                </div>

                {auth === 'checking' ? <div className="subtle" style={{ marginTop: 12 }}>Checking session...</div> : null}
                {error ? <div className="errorBox">{error}</div> : null}
              </form>
            </div>
          </div>

          <div className="footer">Maya Narrative Universe</div>
        </div>
      ) : (
        <>
          <div className="headerBar">
            <div className="container headerInner">
              <div className="headerTitle">
                {isEbookPage ? 'eBook Stats' : 'Tools'}{' '}
                <span className="badge">{isEbookPage ? 'ebook' : 'directory'}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className="subtle">Session expires: {formatExp(session?.exp)}</div>
                <button className="btn" onClick={onLogout} disabled={busy}>
                  Logout
                </button>
              </div>
            </div>
          </div>

          <div className="container content">
            {error ? <div className="errorBox">{error}</div> : null}

            {isEbookPage ? (
              <EbookStats onBack={() => navigate('/')} />
            ) : (
              <div className="toolGrid">
                {cards.map((card) => {
                  if (card.kind === 'internal') {
                    return (
                      <a
                        key={card.path}
                        className="toolCard glassCard appCardLink"
                        href={card.path}
                        onClick={(e) => {
                          e.preventDefault()
                          navigate(card.path)
                        }}
                      >
                        <div className="toolTitle">
                          {card.title} {card.badge ? <span className="pill">{card.badge}</span> : null}
                        </div>
                        <div className="toolDesc">{card.description}</div>
                        <div className="subtle appMeta">{card.path}</div>
                      </a>
                    )
                  }

                  const suffix = deriveServiceSuffix()
                  const href = suffix ? `https://${card.subdomain}.${suffix}` : '#'
                  const disabled = !suffix
                  return (
                    <a
                      key={card.subdomain}
                      className="toolCard glassCard appCardLink"
                      href={href}
                      target={disabled ? undefined : '_blank'}
                      rel={disabled ? undefined : 'noreferrer'}
                      aria-disabled={disabled}
                      onClick={(e) => {
                        if (disabled) e.preventDefault()
                      }}
                    >
                      <div className="toolTitle">
                        {card.title} {card.badge ? <span className="pill">{card.badge}</span> : null}
                      </div>
                      <div className="toolDesc">{card.description}</div>
                      <div className="subtle appMeta">
                        {suffix ? `${card.subdomain}.${suffix}` : 'Configure a real domain to enable links'}
                      </div>
                    </a>
                  )
                })}
              </div>
            )}

            <div className="footer">Maya Narrative Universe</div>
          </div>
        </>
      )}
    </div>
  )
}

export default App
