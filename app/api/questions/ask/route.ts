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

    // 2. Fetch video summaries (high + medium relevance)
    const { data: summaries } = await supabase
      .from('video_summaries')
      .select('summary_text, relevance_category, video_id')
      .in('relevance_category', ['high', 'medium'])

    if (!summaries || summaries.length === 0) {
      return NextResponse.json(
        { error: 'No video summaries available. Run the summarizer first.' },
        { status: 503 }
      )
    }

    // Get video metadata
    const videoIds = summaries.map(s => s.video_id)
    const { data: videos } = await supabase
      .from('youtube_videos')
      .select('id, title, channel_name, url')
      .in('id', videoIds)

    const videoMap: Record<string, { title: string; channel_name: string; url: string }> = {}
    for (const v of videos || []) {
      videoMap[v.id] = v
    }

    // Build knowledge base string
    let knowledgeBase = ''
    const sourceVideos: { title: string; url: string; channel: string }[] = []
    for (const s of summaries) {
      const video = videoMap[s.video_id]
      if (!video) continue
      knowledgeBase += `\n---\n[${video.title}] by ${video.channel_name}\nURL: ${video.url}\n${s.summary_text}\n`
      sourceVideos.push({
        title: video.title,
        url: video.url,
        channel: video.channel_name,
      })
    }

    // 3. Build system prompt (same as generate-answer)
    const systemPrompt = `You are an expert AI product management interview coach. You have a knowledge base of summaries from top AI YouTube videos by industry thought leaders.

Your job: generate a concise, insightful sample answer to a PM interview question.

FORMAT (strict):
1. A 1-2 sentence high-level insight that directly answers the question
2. 2-3 bullet points with specific, concrete supporting insights (each bullet 1-2 sentences max)
3. A "References" line listing 2-3 YouTube videos that most informed the answer (title only, no URLs)

RULES:
- Total answer MUST be under 150 words (excluding references)
- Each bullet should be a distinct, specific, non-overlapping insight
- Draw on concrete concepts, frameworks, and examples from the video knowledge base
- Sound like a confident, knowledgeable PM candidate — no filler, no hedging
- Prioritize practical insights over textbook definitions
- Only cite videos that actually informed your answer
- If the knowledge base doesn't cover the topic well, supplement with your own knowledge but note it

KNOWLEDGE BASE:
${knowledgeBase}`

    // 4. Call OpenAI streaming API
    const openai = getOpenAI()
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
