import { useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import { ArrowLeft, LogOut, RefreshCw } from 'lucide-react'
import EbookStats from './pages/EbookStats'
import mayaLogo from './assets/maya.webp'
import ebookCardBg from './assets/Memory of Water.png'
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
  backgroundSrc?: string
}

type ExternalCard = {
  kind: 'external'
  title: string
  description: string
  subdomain: string
  badge?: string
  backgroundSrc?: string
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

function App() {
  const [auth, setAuth] = useState<'checking' | 'authed' | 'not_authed'>('checking')
  const [_session, setSession] = useState<VerifyResponse | null>(null)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentPath, setCurrentPath] = useState(() => window.location.pathname)
  const [ebookRefreshSeq, setEbookRefreshSeq] = useState(0)
  const [ebookSyncing, setEbookSyncing] = useState(false)

  const cards: CardSpec[] = [
    {
      kind: 'internal',
      title: 'eBook Stats',
      description: 'Visits and downloads, grouped by user + format.',
      path: '/ebook',
      badge: 'Metrics',
      backgroundSrc: ebookCardBg,
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
                <img className="logoImg" src={mayaLogo} alt="" />
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

          <div className="footer" aria-hidden="true">
            <img className="footerLogo" src={mayaLogo} alt="" />
          </div>
        </div>
      ) : (
        <>
          <div className="headerBar">
            <div className="container headerInner">
              <div className="headerTitle">
                <img className="headerLogo" src={mayaLogo} alt="" aria-hidden="true" />
                {isEbookPage ? 'eBook Stats' : 'Tools'}{' '}
                <span className="badge">{isEbookPage ? 'ebook' : 'directory'}</span>
              </div>
              <div className="navActions">
                {isEbookPage ? (
                  <>
                    <button className="btn iconBtn" type="button" onClick={() => navigate('/')} aria-label="Back">
                      <ArrowLeft size={18} />
                    </button>
                    <button
                      className="btn iconBtn"
                      type="button"
                      onClick={() => {
                        setEbookSyncing(true)
                        setEbookRefreshSeq((n) => n + 1)
                      }}
                      disabled={ebookSyncing}
                      aria-label="Sync"
                    >
                      <RefreshCw size={18} className={ebookSyncing ? 'spin' : ''} />
                    </button>
                  </>
                ) : null}
                <button className="btn iconBtn" type="button" onClick={onLogout} disabled={busy} aria-label="Logout">
                  <LogOut size={18} />
                </button>
              </div>
            </div>
          </div>

          <div className="container content">
            {error ? <div className="errorBox">{error}</div> : null}

            {isEbookPage ? (
              <EbookStats
                refreshSeq={ebookRefreshSeq}
                onRefreshComplete={() => setEbookSyncing(false)}
              />
            ) : (
              <div className="toolGrid">
                {cards.map((card) => {
                  if (card.kind === 'internal') {
                    const style: CSSProperties | undefined = card.backgroundSrc
                      ? ({ ['--card-bg' as any]: `url(${card.backgroundSrc})` } as CSSProperties)
                      : undefined
                    return (
                      <a
                        key={card.path}
                        className={`toolCard glassCard appCardLink${card.backgroundSrc ? ' cardHasBg' : ''}`}
                        href={card.path}
                        style={style}
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
                  const style: CSSProperties | undefined = card.backgroundSrc
                    ? ({ ['--card-bg' as any]: `url(${card.backgroundSrc})` } as CSSProperties)
                    : undefined
                  return (
                    <a
                      key={card.subdomain}
                      className={`toolCard glassCard appCardLink${card.backgroundSrc ? ' cardHasBg' : ''}`}
                      href={href}
                      target={disabled ? undefined : '_blank'}
                      rel={disabled ? undefined : 'noreferrer'}
                      aria-disabled={disabled}
                      style={style}
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

            <div className="footer" aria-hidden="true">
              <img className="footerLogo" src={mayaLogo} alt="" />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default App
