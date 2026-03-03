import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

export const dynamic = 'force-dynamic'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
}

export async function POST(request: NextRequest) {
  const supabase = getSupabase()

  let body: { question: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const questionText = body.question?.trim()
  if (!questionText) {
    return NextResponse.json({ error: 'Question text is required' }, { status: 400 })
  }

  try {
    // 1. Insert into merged_questions
    const { data: inserted, error: insertErr } = await supabase
      .from('merged_questions')
      .insert({
        canonical_content: questionText,
        english_content: questionText,
        question_type: 'AI Domain Knowledge',
        question_types: ['AI Domain Knowledge'],
        frequency: 1,
      })
      .select('id')
      .single()

    if (insertErr || !inserted) {
      console.error('Insert error:', insertErr)
      return NextResponse.json(
        { error: insertErr?.message || 'Failed to save question' },
        { status: 500 }
      )
    }

    const questionId = inserted.id

    // 2. Embed the question for vector search
    const openai = getOpenAI()
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: questionText,
    })
    const queryEmbedding = embeddingResponse.data[0].embedding

    // 3. Retrieve relevant transcript chunks via pgvector similarity search
    const { data: chunks, error: chunkErr } = await supabase
      .rpc('match_transcript_chunks', {
        query_embedding: JSON.stringify(queryEmbedding),
        match_count: 10,
        similarity_threshold: 0.3,
      })

    if (chunkErr || !chunks || chunks.length === 0) {
      return NextResponse.json(
        { error: 'No relevant transcript content found.' },
        { status: 503 }
      )
    }

    // 4. Build context from retrieved chunks
    let knowledgeContext = ''
    const sourceVideoMap = new Map<string, { title: string; url: string; channel: string }>()

    for (const chunk of chunks) {
      knowledgeContext += `\n---\n[Source: "${chunk.video_title}" by ${chunk.channel_name}]\n${chunk.chunk_text}\n`
      if (!sourceVideoMap.has(chunk.video_id)) {
        sourceVideoMap.set(chunk.video_id, {
          title: chunk.video_title,
          url: chunk.video_url,
          channel: chunk.channel_name,
        })
      }
    }

    const sourceVideos = Array.from(sourceVideoMap.values())

    // 5. Build system prompt
    const systemPrompt = `You are an expert AI product management interview coach. You have access to specific excerpts from top AI/PM YouTube videos by industry thought leaders.

Your job: generate a concise, insightful sample answer to a PM interview question, grounded in the provided transcript excerpts.

FORMAT (strict):
1. A 1-2 sentence high-level insight that directly answers the question
2. 2-3 bullet points with specific, concrete supporting details (each bullet 1-2 sentences max)
3. A "References" line listing 2-3 YouTube videos that most informed the answer (title only, no URLs)

RULES:
- Total answer MUST be under 150 words (excluding references)
- Ground your answer in specific details, examples, and frameworks from the transcript excerpts — quote or paraphrase specific points, do NOT generalize
- Each bullet should be a distinct insight drawn from different sources when possible
- Sound like a confident, knowledgeable PM candidate — no filler, no hedging
- Only cite videos whose excerpts actually informed your answer
- If the excerpts don't cover the topic well, supplement with your own knowledge but note it

RELEVANT TRANSCRIPT EXCERPTS:
${knowledgeContext}`

    // 6. Call OpenAI streaming API
    const stream = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Interview question: ${questionText}\n\nGenerate a sample answer.` },
      ],
      temperature: 0.3,
      max_tokens: 800,
      stream: true,
    })

    // 5. Stream tokens back via SSE
    let fullAnswer = ''
    const encoder = new TextEncoder()

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || ''
            if (content) {
              fullAnswer += content
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ token: content })}\n\n`)
              )
            }
          }

          // 6. Save answer to sample_answers
          await supabase
            .from('sample_answers')
            .upsert(
              {
                question_id: questionId,
                answer_text: fullAnswer,
                source_videos: sourceVideos,
                model_used: 'gpt-4o-mini',
                generated_at: new Date().toISOString(),
              },
              { onConflict: 'question_id' }
            )

          // 7. Send done event with questionId so frontend can navigate
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ done: true, questionId })}\n\n`)
          )
          controller.close()
        } catch (err: any) {
          console.error('Streaming error:', err)
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: err.message || 'Generation failed' })}\n\n`)
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
    console.error('Ask question error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
