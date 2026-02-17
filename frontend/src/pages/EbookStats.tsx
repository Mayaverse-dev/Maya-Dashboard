import { useEffect, useState } from 'react'

type UserSummary = {
  visited: number
  pdf: number
  pdf_full: number
  pdf_compressed: number
  epub: number
  both: number
  pdf_only: number
  epub_only: number
  kindle: number
}

type UserRow = {
  id: number
  email: string
  name: string
  reward_title: string
  visited: boolean
  dl_pdf: boolean
  dl_pdf_full: boolean
  dl_pdf_compressed: boolean
  dl_epub: boolean
  dl_kindle: boolean
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

type Filter = 'all' | 'visited' | 'pdf' | 'pdf_full' | 'pdf_compressed' | 'epub' | 'both' | 'kindle'

export default function EbookStats({
  refreshSeq,
  onRefreshComplete,
}: {
  refreshSeq: number
  onRefreshComplete: () => void
}) {
  const WINDOW_DAYS = 30
  const PAGE_SIZE = 20

  const [data, setData] = useState<EbookStatsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

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

  const searchLower = search.toLowerCase().trim()
  const filteredUsers = (data?.users ?? []).filter((u) => {
    // Filter by category
    if (filter === 'visited' && !u.visited) return false
    if (filter === 'pdf' && !u.dl_pdf) return false
    if (filter === 'pdf_full' && !u.dl_pdf_full) return false
    if (filter === 'pdf_compressed' && !u.dl_pdf_compressed) return false
    if (filter === 'epub' && !u.dl_epub) return false
    if (filter === 'both' && !(u.dl_pdf && u.dl_epub)) return false
    if (filter === 'kindle' && !u.dl_kindle) return false
    // Filter by search
    if (searchLower) {
      const matchEmail = u.email.toLowerCase().includes(searchLower)
      const matchName = u.name.toLowerCase().includes(searchLower)
      if (!matchEmail && !matchName) return false
    }
    return true
  })

  // Any time the filter/search/data changes, go back to the first page so the
  // table doesn't "get stuck" on an out-of-range page.
  useEffect(() => {
    setPage(1)
  }, [filter, search, data?.users])

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const startIdx = filteredUsers.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1
  const endIdx = Math.min(filteredUsers.length, safePage * PAGE_SIZE)
  const pagedUsers = filteredUsers.slice((safePage - 1) * PAGE_SIZE, (safePage - 1) * PAGE_SIZE + PAGE_SIZE)

  function onTileClick(next: Filter) {
    setFilter(next)
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
            <button className="statTile glassCard statBtn" type="button" onClick={() => onTileClick('pdf_full')}>
              <div className="statValue">{s?.pdf_full ?? 0}</div>
              <div className="statLabel">PDF Full</div>
            </button>
            <button className="statTile glassCard statBtn" type="button" onClick={() => onTileClick('pdf_compressed')}>
              <div className="statValue">{s?.pdf_compressed ?? 0}</div>
              <div className="statLabel">PDF Lite</div>
            </button>
            <button className="statTile glassCard statBtn" type="button" onClick={() => onTileClick('epub')}>
              <div className="statValue">{s?.epub ?? 0}</div>
              <div className="statLabel">ePub</div>
            </button>
            <button className="statTile glassCard statBtn" type="button" onClick={() => onTileClick('both')}>
              <div className="statValue">{s?.both ?? 0}</div>
              <div className="statLabel">Both</div>
            </button>
            <button className="statTile glassCard statBtn" type="button" onClick={() => onTileClick('kindle')}>
              <div className="statValue">{s?.kindle ?? 0}</div>
              <div className="statLabel">Kindle</div>
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
                <button className={`chipBtn${filter === 'pdf_full' ? ' active' : ''}`} type="button" onClick={() => setFilter('pdf_full')}>
                  PDF Full
                </button>
                <button className={`chipBtn${filter === 'pdf_compressed' ? ' active' : ''}`} type="button" onClick={() => setFilter('pdf_compressed')}>
                  PDF Lite
                </button>
                <button className={`chipBtn${filter === 'epub' ? ' active' : ''}`} type="button" onClick={() => setFilter('epub')}>
                  ePub
                </button>
                <button className={`chipBtn${filter === 'both' ? ' active' : ''}`} type="button" onClick={() => setFilter('both')}>
                  Both
                </button>
                <button className={`chipBtn${filter === 'kindle' ? ' active' : ''}`} type="button" onClick={() => setFilter('kindle')}>
                  Kindle
                </button>
              </div>
            </div>

            <div className="searchRow">
              <input
                className="searchInput inputDark"
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by email or name..."
              />
            </div>

            {filteredUsers.length > 0 ? (
              <div className="userTable">
                <div
                  className="chipRow"
                  style={{
                    justifyContent: 'space-between',
                    marginBottom: 10,
                    gap: 10,
                    flexWrap: 'wrap',
                  }}
                >
                  <div className="subtle">
                    Showing {startIdx}-{endIdx} of {filteredUsers.length}
                  </div>
                  <div className="chipRow" style={{ gap: 8 }}>
                    <button
                      className="chipBtn"
                      type="button"
                      disabled={safePage <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      aria-label="Previous page"
                    >
                      Prev
                    </button>
                    <div className="chip" aria-label="Current page">
                      Page {safePage} / {totalPages}
                    </div>
                    <button
                      className="chipBtn"
                      type="button"
                      disabled={safePage >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      aria-label="Next page"
                    >
                      Next
                    </button>
                  </div>
                </div>

                <div className="userTableHead">
                  <span>Email</span>
                  <span>Name</span>
                  <span>Visited</span>
                  <span>PDF Full</span>
                  <span>PDF Lite</span>
                  <span>ePub</span>
                  <span>Kindle</span>
                </div>
                {pagedUsers.map((u) => (
                  <div key={u.id} className="userTableRow">
                    <span className="userEmail">{u.email}</span>
                    <span>{u.name || '-'}</span>
                    <span className={u.visited ? 'yes' : 'no'}>{u.visited ? 'Yes' : '-'}</span>
                    <span className={u.dl_pdf_full ? 'yes' : 'no'}>{u.dl_pdf_full ? 'Yes' : '-'}</span>
                    <span className={u.dl_pdf_compressed ? 'yes' : 'no'}>{u.dl_pdf_compressed ? 'Yes' : '-'}</span>
                    <span className={u.dl_epub ? 'yes' : 'no'}>{u.dl_epub ? 'Yes' : '-'}</span>
                    <span className={u.dl_kindle ? 'yes' : 'no'}>{u.dl_kindle ? 'Yes' : '-'}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="subtle" style={{ marginTop: 12 }}>No users found.</div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
