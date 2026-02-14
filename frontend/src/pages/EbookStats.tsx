import { useEffect, useState } from 'react'

type CountRow<T extends string> = Record<T, string> & { count: number }

type EbookStatsResponse = {
  ok: boolean
  generated_at: string
  window_days: number
  by_format: Array<CountRow<'format'>>
  by_event_type: Array<CountRow<'event_type'>>
  top_countries: Array<CountRow<'country'>>
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

export default function EbookStats({ onBack }: { onBack: () => void }) {
  const WINDOW_DAYS = 30

  const [data, setData] = useState<EbookStatsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function fetchStats(method: 'GET' | 'POST') {
    setError(null)
    try {
      const endpoint =
        method === 'GET'
          ? `/api/ebook/stats?days=${WINDOW_DAYS}`
          : `/api/ebook/sync?days=${WINDOW_DAYS}`
      const stats = await apiFetch<EbookStatsResponse>(endpoint, method === 'GET' ? undefined : { method: 'POST' })
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

  async function onSync() {
    setSyncing(true)
    await fetchStats('POST')
    setSyncing(false)
  }

  const sections: Array<{ title: string; rows: Array<{ label: string; count: number }> }> = [
    {
      title: 'By format',
      rows: (data?.by_format ?? []).map((r) => ({ label: r.format, count: r.count })),
    },
    {
      title: 'By event type',
      rows: (data?.by_event_type ?? []).map((r) => ({ label: r.event_type, count: r.count })),
    },
    {
      title: 'Top countries',
      rows: (data?.top_countries ?? []).map((r) => ({ label: r.country, count: r.count })),
    },
  ]

  return (
    <div className="ebookPage">
      <div className="ebookHeader glassCard">
        <div className="ebookHeaderLeft">
          <button className="btn" type="button" onClick={onBack}>
            Back
          </button>
          <div className="ebookHeaderMeta">
            <div className="ebookHeaderTitle">eBook download events</div>
            <div className="subtle">
              Window: last {WINDOW_DAYS} days • Generated: {formatTs(data?.generated_at)}
            </div>
          </div>
        </div>
        <div className="ebookHeaderRight">
          <button className="btn btnPrimary" type="button" onClick={onSync} disabled={syncing || loading}>
            {syncing ? 'Syncing...' : 'Sync'}
          </button>
        </div>
      </div>

      {error ? <div className="errorBox">{error}</div> : null}

      {loading ? (
        <div className="glassCard card subtle">Loading stats...</div>
      ) : (
        <div className="ebookGrid">
          {sections.map((s) => (
            <div key={s.title} className="glassCard card ebookSection">
              <div className="ebookSectionTitle">{s.title}</div>
              {s.rows.length === 0 ? (
                <div className="subtle">No data</div>
              ) : (
                <div className="ebookList">
                  {s.rows.map((r) => (
                    <div key={r.label} className="ebookRow">
                      <div className="ebookLabel">{r.label}</div>
                      <div className="ebookCount">{r.count}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

