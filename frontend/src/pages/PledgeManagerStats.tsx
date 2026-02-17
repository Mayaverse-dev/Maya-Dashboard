import { useEffect, useState } from 'react'

type Summary = {
  total_users: number
  users_with_address: number
}

type PledgeManagerResponse = {
  ok: boolean
  generated_at: string
  summary: Summary
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

export default function PledgeManagerStats({
  refreshSeq,
  onRefreshComplete,
}: {
  refreshSeq: number
  onRefreshComplete: () => void
}) {
  const [data, setData] = useState<PledgeManagerResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function fetchStats(method: 'GET' | 'POST') {
    setError(null)
    try {
      const endpoint =
        method === 'GET'
          ? '/api/pledge-manager/stats'
          : '/api/pledge-manager/sync'
      const stats = await apiFetch<PledgeManagerResponse>(
        endpoint,
        method === 'GET' ? undefined : { method: 'POST' },
      )
      setData(stats)
    } catch (e) {
      setData(null)
      setError(e instanceof Error ? e.message : 'Failed to load stats')
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

  const s = data?.summary

  const percentage =
    s && s.total_users > 0
      ? ((s.users_with_address / s.total_users) * 100).toFixed(1)
      : '0'

  return (
    <div className="ebookPage">
      <div className="subtle" style={{ marginBottom: 2 }}>
        {formatTs(data?.generated_at)}
      </div>

      {error ? <div className="errorBox">{error}</div> : null}

      {loading ? (
        <div className="glassCard card subtle" style={{ padding: 22 }}>Loading...</div>
      ) : (
        <>
          {/* Summary row */}
          <div className="statRow">
            <div className="statTile glassCard">
              <div className="statValue">{s?.total_users ?? 0}</div>
              <div className="statLabel">Total Users</div>
            </div>
            <div className="statTile glassCard">
              <div className="statValue">{s?.users_with_address ?? 0}</div>
              <div className="statLabel">With Address</div>
            </div>
            <div className="statTile glassCard">
              <div className="statValue">{percentage}%</div>
              <div className="statLabel">Completion</div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
