import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { matchTranscriptChunks } from '@/app/lib/vectorSearch'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

    const emb = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: 'AI product management',
    })

    const embedding = emb.data[0].embedding

    const chunks = await matchTranscriptChunks(embedding, 3, 0.1)

    return NextResponse.json({
      embedding_length: embedding.length,
      embedding_sample: embedding.slice(0, 3),
      chunks_count: chunks.length,
      chunks: chunks.map(c => ({
        similarity: c.similarity,
        title: c.video_title?.substring(0, 50),
        channel: c.channel_name,
      })),
      env: {
        has_supabase_url: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        has_service_key: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        has_anon_key: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        has_openai: !!process.env.OPENAI_API_KEY,
      }
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message, stack: error.stack?.split('\n').slice(0, 3) }, { status: 500 })
  }
}
