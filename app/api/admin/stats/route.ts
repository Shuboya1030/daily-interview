import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET() {
  try {
    // 1. Per-channel stats
    const { data: videos } = await supabase
      .from('youtube_videos')
      .select('id, channel_name, video_id, title, views, published_at, is_relevant')

    const { data: transcripts } = await supabase
      .from('video_transcripts')
      .select('video_id, token_count, extracted_at')

    const { data: summaries } = await supabase
      .from('video_summaries')
      .select('video_id, relevance_score, relevance_category, summarized_at')

    const { data: answers } = await supabase
      .from('sample_answers')
      .select('id')

    // Build transcript and summary lookup sets
    const transcriptSet = new Set((transcripts || []).map(t => t.video_id))
    const summaryMap: Record<string, { relevance_score: number; relevance_category: string }> = {}
    for (const s of summaries || []) {
      summaryMap[s.video_id] = s
    }

    // Per-channel aggregation
    const channelStats: Record<string, {
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
    }> = {}

    for (const v of videos || []) {
      const ch = v.channel_name || 'Unknown'
      if (!channelStats[ch]) {
        channelStats[ch] = {
          total: 0, relevant: 0, has_transcript: 0, has_summary: 0,
          high_relevance: 0, medium_relevance: 0, low_relevance: 0,
          earliest_published: null, latest_published: null,
          pending_transcript: [],
        }
      }
      const s = channelStats[ch]
      s.total++
      if (v.is_relevant) s.relevant++

      const hasT = transcriptSet.has(v.id)
      if (hasT) s.has_transcript++

      const sum = summaryMap[v.id]
      if (sum) {
        s.has_summary++
        if (sum.relevance_category === 'high') s.high_relevance++
        if (sum.relevance_category === 'medium') s.medium_relevance++
        if (sum.relevance_category === 'low') s.low_relevance++
      }

      if (v.published_at) {
        if (!s.earliest_published || v.published_at < s.earliest_published) {
          s.earliest_published = v.published_at
        }
        if (!s.latest_published || v.published_at > s.latest_published) {
          s.latest_published = v.published_at
        }
      }

      // Track videos that still need transcripts
      if (!hasT && v.is_relevant) {
        s.pending_transcript.push({
          title: v.title,
          views: v.views,
          video_id: v.video_id,
        })
      }
    }

    // Sort pending by views desc, limit to top 5 per channel
    for (const ch of Object.keys(channelStats)) {
      channelStats[ch].pending_transcript.sort((a, b) => b.views - a.views)
      channelStats[ch].pending_transcript = channelStats[ch].pending_transcript.slice(0, 5)
    }

    // Overall totals
    const totalVideos = (videos || []).length
    const totalRelevant = (videos || []).filter(v => v.is_relevant).length
    const totalTranscripts = transcripts?.length || 0
    const totalSummaries = summaries?.length || 0
    const totalAnswers = answers?.length || 0

    return NextResponse.json({
      overview: {
        total_videos: totalVideos,
        relevant_videos: totalRelevant,
        total_transcripts: totalTranscripts,
        total_summaries: totalSummaries,
        total_answers: totalAnswers,
        pending_transcripts: totalRelevant - totalTranscripts,
      },
      channels: channelStats,
    })
  } catch (error: any) {
    console.error('Admin stats error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
