import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseKey)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    // Parse query parameters
    const company = searchParams.get('company')
    const questionType = searchParams.get('type')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    // Check if merged_questions has data
    const { count: mergedCount } = await supabase
      .from('merged_questions')
      .select('*', { count: 'exact', head: true })

    if (mergedCount && mergedCount > 0) {
      // Serve from merged_questions (with frequency sorting)
      return await serveMergedQuestions({ company, questionType, limit, offset })
    } else {
      // Fallback to raw_questions if no merged data yet
      return await serveRawQuestions({ company, questionType, limit, offset })
    }

  } catch (error: any) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

async function serveMergedQuestions({ company, questionType, limit, offset }: {
  company: string | null, questionType: string | null, limit: number, offset: number
}) {
  // If filtering by company, we need to join through question_companies + companies
  if (company) {
    // Get company ID first
    const { data: companyData } = await supabase
      .from('companies')
      .select('id')
      .eq('name', company)
      .single()

    if (!companyData) {
      return NextResponse.json({ questions: [], total: 0, limit, offset })
    }

    // Get merged question IDs linked to this company
    const { data: links } = await supabase
      .from('question_companies')
      .select('merged_question_id')
      .eq('company_id', companyData.id)

    const mergedIds = links?.map(l => l.merged_question_id) || []

    if (mergedIds.length === 0) {
      return NextResponse.json({ questions: [], total: 0, limit, offset })
    }

    let query = supabase
      .from('merged_questions')
      .select('*', { count: 'exact' })
      .in('id', mergedIds)

    if (questionType) {
      query = query.eq('question_type', questionType)
    }

    query = query
      .order('frequency', { ascending: false })
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1)

    const { data, error, count } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Enrich with company names
    const enriched = await enrichMergedQuestions(data || [])

    return NextResponse.json({
      questions: enriched,
      total: count || 0,
      limit,
      offset,
    })
  }

  // No company filter - simple query on merged_questions
  let query = supabase
    .from('merged_questions')
    .select('*', { count: 'exact' })

  if (questionType) {
    query = query.eq('question_type', questionType)
  }

  query = query
    .order('frequency', { ascending: false })
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1)

  const { data, error, count } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Enrich with company names
  const enriched = await enrichMergedQuestions(data || [])

  return NextResponse.json({
    questions: enriched,
    total: count || 0,
    limit,
    offset,
  })
}

async function enrichMergedQuestions(questions: any[]) {
  if (questions.length === 0) return []

  const ids = questions.map(q => q.id)

  // Get company links
  const { data: links } = await supabase
    .from('question_companies')
    .select('merged_question_id, company_id')
    .in('merged_question_id', ids)

  // Get company names
  const companyIds = [...new Set(links?.map(l => l.company_id) || [])]
  let companyMap: Record<string, string> = {}

  if (companyIds.length > 0) {
    const { data: companies } = await supabase
      .from('companies')
      .select('id, name')
      .in('id', companyIds)

    companyMap = Object.fromEntries(companies?.map(c => [c.id, c.name]) || [])
  }

  // Build merged_id -> company names mapping
  const questionCompanies: Record<string, string[]> = {}
  for (const link of (links || [])) {
    const name = companyMap[link.company_id]
    if (name) {
      if (!questionCompanies[link.merged_question_id]) {
        questionCompanies[link.merged_question_id] = []
      }
      questionCompanies[link.merged_question_id].push(name)
    }
  }

  return questions.map(q => ({
    id: q.id,
    content: q.canonical_content,
    frequency: q.frequency,
    question_type: q.question_type,
    company: questionCompanies[q.id]?.join(', ') || null,
    companies: questionCompanies[q.id] || [],
    updated_at: q.updated_at,
  }))
}

async function serveRawQuestions({ company, questionType, limit, offset }: {
  company: string | null, questionType: string | null, limit: number, offset: number
}) {
  let query = supabase
    .from('raw_questions')
    .select('*', { count: 'exact' })

  if (company) {
    query = query.eq('company', company)
  }
  if (questionType) {
    query = query.eq('question_type', questionType)
  }

  query = query
    .order('scraped_at', { ascending: false })
    .range(offset, offset + limit - 1)

  const { data, error, count } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Map to same shape as merged response
  const questions = (data || []).map(q => ({
    id: q.id,
    content: q.content,
    frequency: 1,
    question_type: q.question_type,
    company: q.company,
    companies: q.company ? [q.company] : [],
    updated_at: q.scraped_at,
  }))

  return NextResponse.json({
    questions,
    total: count || 0,
    limit,
    offset,
  })
}
