import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
}

export async function POST(request: NextRequest) {
  const { jd } = await request.json()

  if (!jd || typeof jd !== 'string' || jd.trim().length < 50) {
    return Response.json(
      { error: 'Please paste a job description (at least 50 characters).' },
      { status: 400 }
    )
  }

  const supabase = getSupabase()
  const openai = getOpenAI()

  try {
    // 1. Embed the JD
    const embeddingRes = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: jd.slice(0, 8000),
    })
    const jdEmbedding = embeddingRes.data[0].embedding

    // 2. Vector search transcript chunks for expert context
    const { data: chunks } = await supabase.rpc('match_transcript_chunks', {
      query_embedding: JSON.stringify(jdEmbedding),
      match_count: 8,
      similarity_threshold: 0.25,
    })

    let expertContext = ''
    if (chunks && chunks.length > 0) {
      expertContext = chunks
        .map((c: any) => `[${c.channel_name} — "${c.video_title}"]\n${c.chunk_text}`)
        .join('\n\n---\n\n')
    }

    // 3. Text-search existing questions that match JD keywords
    // Extract key terms from JD for matching
    const keyTermsRes = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Extract 5-8 key technical/product terms from this job description. Return as a comma-separated list, nothing else.',
        },
        { role: 'user', content: jd.slice(0, 4000) },
      ],
      temperature: 0,
      max_tokens: 100,
    })
    const keyTerms = keyTermsRes.choices[0]?.message?.content || ''

    // Search merged_questions using text search
    const searchTerms = keyTerms.split(',').map(t => t.trim()).filter(Boolean).slice(0, 5)
    const matchedQuestions: { id: string; content: string; frequency: number; question_types: string[] }[] = []
    const seenIds = new Set<string>()

    for (const term of searchTerms) {
      const { data: qs } = await supabase
        .from('merged_questions')
        .select('id, canonical_content, english_content, frequency, question_types')
        .or(`canonical_content.ilike.%${term}%,english_content.ilike.%${term}%`)
        .order('frequency', { ascending: false })
        .limit(5)

      for (const q of qs || []) {
        if (!seenIds.has(q.id)) {
          seenIds.add(q.id)
          matchedQuestions.push({
            id: q.id,
            content: q.english_content || q.canonical_content,
            frequency: q.frequency,
            question_types: q.question_types || [],
          })
        }
      }
    }

    // Sort by frequency and take top 8
    const topMatched = matchedQuestions
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 8)

    const existingQuestionsContext = topMatched.length > 0
      ? '\n\nRELATED QUESTIONS FROM OUR DATABASE:\n' +
        topMatched.map(q => `- ${q.content} (asked ${q.frequency}x)`).join('\n')
      : ''

    // 4. Generate predicted questions via streaming
    const systemPrompt = `You are an expert AI PM interview coach. A candidate has shared a job description. Based on the JD, expert YouTube insights, and real interview questions from our database, predict the most likely interview questions.

EXPERT INSIGHTS FROM YOUTUBE:
${expertContext || '(No specific expert content matched)'}
${existingQuestionsContext}

INSTRUCTIONS:
- Generate exactly 6 predicted interview questions tailored to this specific JD
- For each question, provide:
  1. The question itself
  2. A brief "Why this matters" explanation (1 sentence) connecting the question to the JD requirements
  3. A difficulty tag: [Foundational] [Intermediate] [Advanced]
- Order from most likely to be asked to least likely
- Mix question types: product design, behavioral, technical, strategy, metrics
- Ground predictions in the expert insights and real questions when relevant
- Be specific to the role — not generic PM questions

FORMAT (strict — follow exactly):
### Q1: [question text]
**Why:** [1-sentence explanation tied to JD]
**Level:** [Foundational/Intermediate/Advanced]

### Q2: [question text]
...and so on for all 6 questions.`

    const stream = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Here is the job description:\n\n${jd.slice(0, 6000)}` },
      ],
      temperature: 0.4,
      max_tokens: 1500,
      stream: true,
    })

    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        try {
          // Send matched questions first
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ matched_questions: topMatched })}\n\n`
            )
          )

          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || ''
            if (content) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ token: content })}\n\n`)
              )
            }
          }

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`)
          )
          controller.close()
        } catch (err: any) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: err.message })}\n\n`)
          )
          controller.close()
        }
      },
    })

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (error: any) {
    console.error('JD analyze error:', error)
    return Response.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
