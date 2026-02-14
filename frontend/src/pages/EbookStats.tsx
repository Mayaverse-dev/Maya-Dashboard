import { useEffect, useState } from 'react'

type UserSummary = {
  visited: number
  pdf: number
  epub: number
  both: number
  pdf_only: number
  epub_only: number
}

type UserRow = {
  id: number
  email: string
  name: string
  reward_title: string
  visited: boolean
  dl_pdf: boolean
  dl_epub: boolean
}

type EbookStatsResponse = {
  ok: boolean
  generated_at: string
  window_days: number
  user_summary: UserSummary
  users: UserRow[]
}

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
    throw new Error(text || `Request failed (${res.status})`)
  }

  return (await res.json()) as T
}

function formatTs(ts?: string) {
  if (!ts) return 'n/a'
  try {
    return new Date(ts).toLocaleString()
  } catch {
    return ts
  }
}

type Filter = 'all' | 'visited' | 'pdf' | 'epub' | 'both'

export default function EbookStats({
  refreshSeq,
  onRefreshComplete,
}: {
  refreshSeq: number
  onRefreshComplete: () => void
}) {
  const WINDOW_DAYS = 30

  const [data, setData] = useState<EbookStatsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showUsers, setShowUsers] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')

  async function fetchStats(method: 'GET' | 'POST') {
    setError(null)
    try {
      const endpoint =
        method === 'GET'
          ? `/api/ebook/stats?days=${WINDOW_DAYS}`
          : `/api/ebook/sync?days=${WINDOW_DAYS}`
      const stats = await apiFetch<EbookStatsResponse>(
        endpoint,
        method === 'GET' ? undefined : { method: 'POST' },
      )
      setData(stats)
    } catch (e) {
      setData(null)
      setError(e instanceof Error ? e.message : 'Failed to load eBook stats')
    }
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      await fetchStats('GET')
      if (!cancelled) setLoading(false)
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (refreshSeq === 0) return
    let cancelled = false

    ;(async () => {
      try {
        await fetchStats('POST')
      } finally {
        if (!cancelled) onRefreshComplete()
      }
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSeq])

  const s = data?.user_summary

  const filteredUsers = (data?.users ?? []).filter((u) => {
    if (filter === 'all') return true
    if (filter === 'visited') return u.visited
    if (filter === 'pdf') return u.dl_pdf
    if (filter === 'epub') return u.dl_epub
    return u.dl_pdf && u.dl_epub
  })

  function onTileClick(next: Filter) {
    setFilter(next)
    setShowUsers(true)
  }

  return (
    <div className="ebookPage">
      <div className="subtle" style={{ marginBottom: 2 }}>
        Last {WINDOW_DAYS} days &bull; {formatTs(data?.generated_at)}
      </div>

      {error ? <div className="errorBox">{error}</div> : null}

      {loading ? (
        <div className="glassCard card subtle" style={{ padding: 22 }}>Loading...</div>
      ) : (
        <>
          {/* User summary row */}
          <div className="statRow">
            <button className="statTile glassCard statBtn" type="button" onClick={() => onTileClick('visited')}>
              <div className="statValue">{s?.visited ?? 0}</div>
              <div className="statLabel">Visited</div>
            </button>
            <button className="statTile glassCard statBtn" type="button" onClick={() => onTileClick('pdf')}>
              <div className="statValue">{s?.pdf ?? 0}</div>
              <div className="statLabel">PDF</div>
            </button>
            <button className="statTile glassCard statBtn" type="button" onClick={() => onTileClick('epub')}>
              <div className="statValue">{s?.epub ?? 0}</div>
              <div className="statLabel">ePub</div>
            </button>
            <button className="statTile glassCard statBtn" type="button" onClick={() => onTileClick('both')}>
              <div className="statValue">{s?.both ?? 0}</div>
              <div className="statLabel">Both</div>
            </button>
          </div>

          {/* Users section */}
          <div className="glassCard card">
            <div className="sectionHeader">
              <div className="sectionTitle">
                Users ({filteredUsers.length})
                <span className="chip">{filter === 'all' ? 'all' : filter}</span>
              </div>
              <div className="chipRow">
                <button className={`chipBtn${filter === 'all' ? ' active' : ''}`} type="button" onClick={() => setFilter('all')}>
                  All
                </button>
                <button className={`chipBtn${filter === 'visited' ? ' active' : ''}`} type="button" onClick={() => setFilter('visited')}>
                  Visited
                </button>
                <button className={`chipBtn${filter === 'pdf' ? ' active' : ''}`} type="button" onClick={() => setFilter('pdf')}>
                  PDF
                </button>
                <button className={`chipBtn${filter === 'epub' ? ' active' : ''}`} type="button" onClick={() => setFilter('epub')}>
                  ePub
                </button>
                <button className={`chipBtn${filter === 'both' ? ' active' : ''}`} type="button" onClick={() => setFilter('both')}>
                  Both
                </button>
                <button className="btn" type="button" onClick={() => setShowUsers((p) => !p)}>
                  {showUsers ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            {showUsers && filteredUsers.length > 0 ? (
              <div className="userTable">
                <div className="userTableHead">
                  <span>Email</span>
                  <span>Name</span>
                  <span>Visited</span>
                  <span>PDF</span>
                  <span>ePub</span>
                </div>
                {filteredUsers.map((u) => (
                  <div key={u.id} className="userTableRow">
                    <span className="userEmail">{u.email}</span>
                    <span>{u.name || '-'}</span>
                    <span className={u.visited ? 'yes' : 'no'}>{u.visited ? 'Yes' : '-'}</span>
                    <span className={u.dl_pdf ? 'yes' : 'no'}>{u.dl_pdf ? 'Yes' : '-'}</span>
                    <span className={u.dl_epub ? 'yes' : 'no'}>{u.dl_epub ? 'Yes' : '-'}</span>
                  </div>
                ))}
              </div>
            ) : null}

            {showUsers && filteredUsers.length === 0 ? (
              <div className="subtle">No users found in this window.</div>
            ) : null}
          </div>
        </>
      )}
    </div>
  )
}
