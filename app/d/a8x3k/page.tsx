'use client'

import { useState, useEffect } from 'react'

interface DailyData {
  date: string
  pv: number
  uv: number
}

interface AnalyticsData {
  today: { pv: number; uv: number }
  period: { days: number; total_pv: number; total_uv: number }
  daily: DailyData[]
  topPages: { path: string; count: number }[]
}

function MiniBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? (value / max) * 100 : 0
  return (
    <div className="h-full w-full flex items-end">
      <div
        className="w-full bg-blue-500 rounded-t"
        style={{ height: `${Math.max(pct, 2)}%` }}
      />
    </div>
  )
}

export default function AnalyticsDashboard() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [days, setDays] = useState(30)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/d/a8x3k?days=${days}`)
      .then(res => res.json())
      .then(d => setData(d))
      .catch(err => console.error(err))
      .finally(() => setLoading(false))
  }, [days])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gray-950 text-red-400 flex items-center justify-center">
        Failed to load analytics
      </div>
    )
  }

  const maxPV = Math.max(...data.daily.map(d => d.pv), 1)
  const maxUV = Math.max(...data.daily.map(d => d.uv), 1)

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 max-w-4xl mx-auto">
      <h1 className="text-xl font-bold mb-6">Site Analytics</h1>

      {/* Today */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <StatCard label="Today PV" value={data.today.pv} />
        <StatCard label="Today UV" value={data.today.uv} />
        <StatCard label={`${days}d PV`} value={data.period.total_pv} />
        <StatCard label={`${days}d UV`} value={data.period.total_uv} />
      </div>

      {/* Period selector */}
      <div className="flex gap-2 mb-4">
        {[7, 14, 30, 90].map(d => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`px-3 py-1 rounded text-sm ${
              days === d
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            {d}d
          </button>
        ))}
      </div>

      {/* PV Chart */}
      <div className="bg-gray-900 rounded-lg p-4 mb-4">
        <h2 className="text-sm text-gray-400 mb-3">Daily Page Views</h2>
        <div className="flex items-end gap-[2px] h-32">
          {data.daily.map(d => (
            <div key={d.date} className="flex-1 h-full group relative">
              <MiniBar value={d.pv} max={maxPV} />
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-gray-800 text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                {d.date}: {d.pv} PV
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* UV Chart */}
      <div className="bg-gray-900 rounded-lg p-4 mb-8">
        <h2 className="text-sm text-gray-400 mb-3">Daily Unique Visitors (DAU)</h2>
        <div className="flex items-end gap-[2px] h-32">
          {data.daily.map(d => (
            <div key={d.date} className="flex-1 h-full group relative">
              <div className="h-full w-full flex items-end">
                <div
                  className="w-full bg-green-500 rounded-t"
                  style={{ height: `${Math.max((d.uv / maxUV) * 100, 2)}%` }}
                />
              </div>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-gray-800 text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                {d.date}: {d.uv} UV
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top Pages */}
      <div className="bg-gray-900 rounded-lg p-4">
        <h2 className="text-sm text-gray-400 mb-3">Top Pages</h2>
        <div className="space-y-2">
          {data.topPages.map((p, i) => (
            <div key={p.path} className="flex justify-between text-sm">
              <span className="text-gray-300">
                <span className="text-gray-600 mr-2">{i + 1}.</span>
                {p.path}
              </span>
              <span className="text-gray-500">{p.count}</span>
            </div>
          ))}
          {data.topPages.length === 0 && (
            <p className="text-gray-600 text-sm">No data yet</p>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-gray-900 rounded-lg p-4 text-center">
      <p className="text-2xl font-bold">{value.toLocaleString()}</p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </div>
  )
}
