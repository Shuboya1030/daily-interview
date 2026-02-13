import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseKey)

export async function GET() {
  try {
    // Get unique companies
    const { data: companies } = await supabase
      .from('raw_questions')
      .select('company')
      .not('company', 'is', null)

    const uniqueCompanies = [...new Set(companies?.map(c => c.company) || [])]
      .filter(Boolean)
      .sort()

    // Get unique question types
    const { data: types } = await supabase
      .from('raw_questions')
      .select('question_type')
      .not('question_type', 'is', null)

    const uniqueTypes = [...new Set(types?.map(t => t.question_type) || [])]
      .filter(Boolean)
      .sort()

    // Get unique sources
    const { data: sources } = await supabase
      .from('raw_questions')
      .select('source')

    const uniqueSources = [...new Set(sources?.map(s => s.source) || [])]
      .filter(Boolean)
      .sort()

    return NextResponse.json({
      companies: uniqueCompanies,
      types: uniqueTypes,
      sources: uniqueSources,
    })

  } catch (error: any) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
