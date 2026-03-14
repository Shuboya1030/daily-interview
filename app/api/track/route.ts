import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { path, visitor_id, referrer } = await request.json()

    if (!path || !visitor_id) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const user_agent = request.headers.get('user-agent') || ''

    await supabase.from('page_views').insert({
      path,
      visitor_id,
      referrer: referrer || null,
      user_agent,
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
