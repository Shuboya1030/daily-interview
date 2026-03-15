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
  const { question } = await request.json()

  if (!question || typeof question !== 'string' || question.trim().length < 10) {
    return Response.json({ error: 'Invalid question' }, { status: 400 })
  }

  const supabase = getSupabase()
  const openai = getOpenAI()

  try {
    // 1. Embed the question
    const embRes = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: question,
    })

    // 2. Vector search transcript chunks
    const { data: chunks } = await supabase.rpc('match_transcript_chunks', {
      query_embedding: JSON.stringify(embRes.data[0].embedding),
      match_count: 8,
      similarity_threshold: 0.25,
    })

    if (!chunks || chunks.length === 0) {
      return Response.json({ error: 'No relevant expert content found.' }, { status: 503 })
    }

    // 3. Build context
    let knowledgeContext = ''
    const topChunks: { text: string; video_title: string; channel: string; video_url: string; similarity: number }[] = []

    for (const chunk of chunks) {
      knowledgeContext += `\n---\n[${chunk.channel_name} — "${chunk.video_title}"]\n${chunk.chunk_text}\n`
      topChunks.push({
        text: chunk.chunk_text,
        video_title: chunk.video_title,
        channel: chunk.channel_name,
        video_url: chunk.video_url,
        similarity: chunk.similarity,
      })
    }

    const bestChunks = topChunks.sort((a, b) => b.similarity - a.similarity).slice(0, 4)

    // 4. Generate insight (streaming) + enhance quotes in parallel after
    const stream = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are an expert AI PM interview coach. Generate a concise expert insight for the given interview question, grounded in the provided transcript excerpts.

FORMAT (strict):
1. A 1-2 sentence high-level insight that directly answers the question
2. 2-3 bullet points with specific, concrete supporting details (1-2 sentences each)

RULES:
- Total MUST be under 120 words
- Ground in specific details from the excerpts
- Sound like a confident PM candidate
- No references section needed

TRANSCRIPT EXCERPTS:
${knowledgeContext}`,
        },
        { role: 'user', content: `Interview question: ${question}` },
      ],
      temperature: 0.3,
      max_tokens: 600,
      stream: true,
    })

    let fullText = ''
    const encoder = new TextEncoder()

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || ''
            if (content) {
              fullText += content
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ token: content })}\n\n`)
              )
            }
          }

          // Enhance quotes
          const quotesPrompt = bestChunks.map((c, i) =>
            `[${i + 1}] From "${c.video_title}" by ${c.channel}:\n${c.text}`
          ).join('\n\n---\n\n')

          const quotesRes = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: `Distill each raw transcript excerpt into ONE crisp, quotable sentence (max 30 words) that captures the core insight in the speaker's voice. Respond with a JSON array of strings. No explanation.`,
              },
              { role: 'user', content: quotesPrompt },
            ],
            temperature: 0.2,
            max_tokens: 400,
          })

          let enhancedChunks = bestChunks
          try {
            const raw = quotesRes.choices[0]?.message?.content || '[]'
            const polished: string[] = JSON.parse(raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim())
            if (Array.isArray(polished) && polished.length === bestChunks.length) {
              enhancedChunks = bestChunks.map((c, i) => ({ ...c, text: polished[i] }))
            }
          } catch {
            // keep originals
          }

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ done: true, quotes: enhancedChunks })}\n\n`)
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
    console.error('JD insights error:', error)
    return Response.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
