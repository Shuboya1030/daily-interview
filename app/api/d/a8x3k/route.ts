import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const days = parseInt(searchParams.get('days') || '30')

  try {
    const since = new Date()
    since.setDate(since.getDate() - days)

    const { data: views, error } = await supabase
      .from('page_views')
      .select('path, visitor_id, created_at')
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: true })

    if (error) throw error

    // Aggregate by day
    const dailyMap: Record<string, { pv: number; visitors: Set<string> }> = {}
    const pageMap: Record<string, number> = {}

    for (const v of views || []) {
      const day = v.created_at.substring(0, 10)
      if (!dailyMap[day]) dailyMap[day] = { pv: 0, visitors: new Set() }
      dailyMap[day].pv++
      dailyMap[day].visitors.add(v.visitor_id)

      pageMap[v.path] = (pageMap[v.path] || 0) + 1
    }

    // Fill missing days
    const daily = []
    const cursor = new Date(since)
    const today = new Date()
    while (cursor <= today) {
      const key = cursor.toISOString().substring(0, 10)
      const entry = dailyMap[key]
      daily.push({
        date: key,
        pv: entry?.pv || 0,
        uv: entry?.visitors.size || 0,
      })
      cursor.setDate(cursor.getDate() + 1)
    }

    // Today's stats
    const todayKey = today.toISOString().substring(0, 10)
    const todayEntry = dailyMap[todayKey]

    // Top pages
    const topPages = Object.entries(pageMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([path, count]) => ({ path, count }))

    // Total unique visitors in period
    const allVisitors = new Set((views || []).map(v => v.visitor_id))

    return NextResponse.json({
      today: {
        pv: todayEntry?.pv || 0,
        uv: todayEntry?.visitors.size || 0,
      },
      period: {
        days,
        total_pv: (views || []).length,
        total_uv: allVisitors.size,
      },
      daily,
      topPages,
    })
  } catch (error: any) {
    console.error('Analytics error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
