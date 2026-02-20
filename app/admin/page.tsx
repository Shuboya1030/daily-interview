'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface ChannelStats {
  total: number
  relevant: number
  has_transcript: number
  has_summary: number
  high_relevance: number
  medium_relevance: number
  low_relevance: number
  earliest_published: string | null
  latest_published: string | null
  pending_transcript: { title: string; views: number; video_id: string }[]
}

interface StatsData {
  overview: {
    total_videos: number
    relevant_videos: number
    total_transcripts: number
    total_summaries: number
    total_answers: number
    pending_transcripts: number
  }
  channels: Record<string, ChannelStats>
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function ProgressBar({ value, max, color = 'bg-accent' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-cream-dark rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-ink/50 w-10 text-right">{pct}%</span>
    </div>
  )
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/stats')
      .then(res => res.json())
      .then(data => setStats(data))
      .catch(err => console.error('Failed to load stats:', err))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-accent" />
          <p className="mt-4 text-ink/60">Loading stats...</p>
        </div>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p className="text-red-500">Failed to load stats</p>
      </div>
    )
  }

  const { overview, channels } = stats

  // Sort channels by total videos desc
  const sortedChannels = Object.entries(channels).sort((a, b) => b[1].total - a[1].total)

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <Link
        href="/"
        className="text-accent hover:text-accent/80 text-sm font-medium mb-6 inline-block"
      >
        &larr; Home
      </Link>

      <h1 className="text-2xl font-bold text-ink mb-6">Knowledge Base Dashboard</h1>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
        {[
          { label: 'Videos', value: overview.total_videos },
          { label: 'Relevant', value: overview.relevant_videos },
          { label: 'Transcripts', value: overview.total_transcripts },
          { label: 'Summaries', value: overview.total_summaries },
          { label: 'Answers', value: overview.total_answers },
          { label: 'Pending', value: overview.pending_transcripts, highlight: true },
        ].map(card => (
          <div
            key={card.label}
            className={`rounded-lg p-4 text-center ${
              card.highlight
                ? 'bg-accent/10 border border-accent/30'
                : 'bg-cream-dark/30 border border-cream-dark'
            }`}
          >
            <p className={`text-2xl font-bold ${card.highlight ? 'text-accent' : 'text-ink'}`}>
              {card.value}
            </p>
            <p className="text-xs text-ink/50 mt-1">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Pipeline Progress */}
      <div className="bg-cream-dark/30 border border-cream-dark rounded-lg p-6 mb-8">
        <h2 className="text-sm font-semibold text-ink/70 mb-4">Pipeline Progress</h2>
        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-xs text-ink/60 mb-1">
              <span>Transcripts fetched</span>
              <span>{overview.total_transcripts} / {overview.relevant_videos}</span>
            </div>
            <ProgressBar value={overview.total_transcripts} max={overview.relevant_videos} />
          </div>
          <div>
            <div className="flex justify-between text-xs text-ink/60 mb-1">
              <span>Summaries generated</span>
              <span>{overview.total_summaries} / {overview.total_transcripts}</span>
            </div>
            <ProgressBar value={overview.total_summaries} max={overview.total_transcripts} color="bg-green-500" />
          </div>
        </div>
      </div>

      {/* Channel Table */}
      <h2 className="text-lg font-semibold text-ink mb-4">Channels</h2>
      <div className="space-y-4">
        {sortedChannels.map(([name, ch]) => (
          <div key={name} className="bg-cream-dark/30 border border-cream-dark rounded-lg p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-semibold text-ink">{name}</h3>
                <p className="text-xs text-ink/40 mt-0.5">
                  {formatDate(ch.earliest_published)} — {formatDate(ch.latest_published)}
                </p>
              </div>
              <div className="flex gap-4 text-right">
                <div>
                  <p className="text-sm font-medium text-ink">{ch.total}</p>
                  <p className="text-xs text-ink/40">videos</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-ink">{ch.has_transcript}</p>
                  <p className="text-xs text-ink/40">transcripts</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-ink">{ch.has_summary}</p>
                  <p className="text-xs text-ink/40">summaries</p>
                </div>
              </div>
            </div>

            {/* Relevance breakdown */}
            {ch.has_summary > 0 && (
              <div className="flex gap-2 mb-3">
                {ch.high_relevance > 0 && (
                  <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded">
                    {ch.high_relevance} high
                  </span>
                )}
                {ch.medium_relevance > 0 && (
                  <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded">
                    {ch.medium_relevance} medium
                  </span>
                )}
                {ch.low_relevance > 0 && (
                  <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded">
                    {ch.low_relevance} low
                  </span>
                )}
              </div>
            )}

            {/* Progress bar */}
            {ch.relevant > 0 && (
              <ProgressBar value={ch.has_transcript} max={ch.relevant} />
            )}

            {/* Pending videos */}
            {ch.pending_transcript.length > 0 && (
              <div className="mt-3 pt-3 border-t border-cream-dark">
                <p className="text-xs text-ink/40 mb-1.5">
                  Pending transcripts ({ch.relevant - ch.has_transcript} total, showing top {ch.pending_transcript.length})
                </p>
                {ch.pending_transcript.map((v, i) => (
                  <div key={i} className="flex justify-between text-xs py-0.5">
                    <span className="text-ink/60 truncate mr-4">{v.title}</span>
                    <span className="text-ink/40 shrink-0">{v.views?.toLocaleString()} views</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
