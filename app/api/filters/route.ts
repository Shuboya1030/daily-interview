import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseKey)

export async function GET() {
  try {
    const { count: mergedCount } = await supabase
      .from('merged_questions')
      .select('*', { count: 'exact', head: true })

    if (mergedCount && mergedCount > 0) {
      return await getMergedFilters()
    } else {
      return await getRawFilters()
    }
  } catch (error: any) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

async function getMergedFilters() {
  // Get companies
  const { data: companyLinks } = await supabase
    .from('question_companies')
    .select('company_id')

  const companyIds = [...new Set(companyLinks?.map(l => l.company_id) || [])]

  let uniqueCompanies: string[] = []
  if (companyIds.length > 0) {
    const { data: companies } = await supabase
      .from('companies')
      .select('name')
      .in('id', companyIds)

    uniqueCompanies = (companies?.map(c => c.name) || []).sort()
  }

  // Get unique types from question_types array column
  const { data: rows } = await supabase
    .from('merged_questions')
    .select('question_types')
    .not('question_types', 'is', null)

  const allTypes = new Set<string>()
  for (const row of (rows || [])) {
    if (Array.isArray(row.question_types)) {
      for (const t of row.question_types) {
        allTypes.add(t)
      }
    }
  }

  return NextResponse.json({
    companies: uniqueCompanies,
    types: [...allTypes].sort(),
  })
}

async function getRawFilters() {
  const { data: companies } = await supabase
    .from('raw_questions')
    .select('company')
    .not('company', 'is', null)

  const uniqueCompanies = [...new Set(companies?.map(c => c.company) || [])]
    .filter(Boolean)
    .sort()

  const { data: types } = await supabase
    .from('raw_questions')
    .select('question_type')
    .not('question_type', 'is', null)

  const uniqueTypes = [...new Set(types?.map(t => t.question_type) || [])]
    .filter(Boolean)
    .sort()

  return NextResponse.json({
    companies: uniqueCompanies,
    types: uniqueTypes,
  })
}
