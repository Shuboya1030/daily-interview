import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseKey)

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params

    // Get the merged question
    const { data: merged, error: mergedError } = await supabase
      .from('merged_questions')
      .select('*')
      .eq('id', id)
      .single()

    if (mergedError || !merged) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 })
    }

    // Get all raw questions mapped to this merged question
    const { data: mappings } = await supabase
      .from('question_mappings')
      .select('raw_question_id, similarity_score')
      .eq('merged_question_id', id)

    const rawIds = mappings?.map(m => m.raw_question_id) || []
    const similarityMap: Record<string, number> = {}
    for (const m of (mappings || [])) {
      similarityMap[m.raw_question_id] = m.similarity_score
    }

    let rawQuestions: any[] = []
    if (rawIds.length > 0) {
      const { data: raws } = await supabase
        .from('raw_questions')
        .select('id, content, source, source_url, company, question_type, scraped_at, published_at')
        .in('id', rawIds)

      rawQuestions = (raws || []).map(rq => ({
        ...rq,
        similarity_score: similarityMap[rq.id] || 0,
      }))
    }

    // Get companies linked to this merged question
    const { data: companyLinks } = await supabase
      .from('question_companies')
      .select('company_id')
      .eq('merged_question_id', id)

    const companyIds = companyLinks?.map(l => l.company_id) || []
    let companies: string[] = []

    if (companyIds.length > 0) {
      const { data: companyData } = await supabase
        .from('companies')
        .select('name')
        .in('id', companyIds)

      companies = companyData?.map(c => c.name) || []
    }

    return NextResponse.json({
      id: merged.id,
      content: merged.canonical_content,
      frequency: merged.frequency,
      question_type: merged.question_type,
      question_types: merged.question_types || (merged.question_type ? [merged.question_type] : []),
      companies,
      updated_at: merged.updated_at,
      raw_questions: rawQuestions,
    })

  } catch (error: any) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
