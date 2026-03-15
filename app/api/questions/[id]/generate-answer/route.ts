import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

export const dynamic = 'force-dynamic'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params
  const supabase = getSupabase()
  const { searchParams } = new URL(request.url)
  const regenerate = searchParams.get('regenerate') === 'true'

  try {
    // 1. Check cache first (skip if regenerating)
    if (!regenerate) {
      const { data: cached } = await supabase
        .from('sample_answers')
        .select('answer_text, source_videos, source_chunks, model_used, generated_at')
        .eq('question_id', id)
        .single()

      if (cached) {
        return NextResponse.json({ cached: true, ...cached })
      }
    }

    // 2. Get the question text
    const { data: question, error: qErr } = await supabase
      .from('merged_questions')
      .select('canonical_content, english_content')
      .eq('id', id)
      .single()

    if (qErr || !question) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 })
    }

    const questionText = question.english_content || question.canonical_content

    // 3. Embed the question for vector search
    const openai = getOpenAI()
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: questionText,
    })
    const queryEmbedding = embeddingResponse.data[0].embedding

    // 4. Retrieve relevant transcript chunks via pgvector similarity search
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

    // 5. Build context from retrieved chunks
    let knowledgeContext = ''
    const sourceVideoMap = new Map<string, { title: string; url: string; channel: string }>()
    const sourceChunks: { text: string; video_title: string; channel: string; video_url: string; similarity: number }[] = []

    for (const chunk of chunks) {
      knowledgeContext += `\n---\n[Source: "${chunk.video_title}" by ${chunk.channel_name}]\n${chunk.chunk_text}\n`
      if (!sourceVideoMap.has(chunk.video_id)) {
        sourceVideoMap.set(chunk.video_id, {
          title: chunk.video_title,
          url: chunk.video_url,
          channel: chunk.channel_name,
        })
      }
      sourceChunks.push({
        text: chunk.chunk_text,
        video_title: chunk.video_title,
        channel: chunk.channel_name,
        video_url: chunk.video_url,
        similarity: chunk.similarity,
      })
    }

    // Keep top 5 most relevant chunks for display
    const topChunks = sourceChunks
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5)

    const sourceVideos = Array.from(sourceVideoMap.values())

    // 6. Build system prompt
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

    // 7. Call OpenAI streaming API
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

    // 6. Stream tokens back via SSE
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

          // 7. Enhance raw quotes into polished key takeaways
          const quotesPrompt = topChunks.map((c, i) =>
            `[${i + 1}] From "${c.video_title}" by ${c.channel}:\n${c.text}`
          ).join('\n\n---\n\n')

          const quotesResponse = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: `You are distilling raw YouTube transcript excerpts into crisp, quotable key takeaways.

For each excerpt, produce exactly ONE polished sentence (max 30 words) that:
- Captures the core insight in the speaker's voice
- Reads like a memorable quote you'd highlight in a book
- Preserves the original meaning — do NOT invent new ideas

Respond with a JSON array of strings, one per excerpt, in the same order. No explanation, just the JSON array.`,
              },
              { role: 'user', content: quotesPrompt },
            ],
            temperature: 0.2,
            max_tokens: 500,
          })

          let enhancedChunks = topChunks
          try {
            const raw = quotesResponse.choices[0]?.message?.content || '[]'
            const polished: string[] = JSON.parse(raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim())
            if (Array.isArray(polished) && polished.length === topChunks.length) {
              enhancedChunks = topChunks.map((c, i) => ({ ...c, text: polished[i] }))
            }
          } catch {
            // If parsing fails, keep original chunks
          }

          // 8. Save to DB
          await supabase
            .from('sample_answers')
            .upsert(
              {
                question_id: id,
                answer_text: fullAnswer,
                source_videos: sourceVideos,
                source_chunks: enhancedChunks,
                model_used: 'gpt-4o-mini',
                generated_at: new Date().toISOString(),
              },
              { onConflict: 'question_id' }
            )

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ done: true, source_chunks: enhancedChunks })}\n\n`)
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
    console.error('Generate answer error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
