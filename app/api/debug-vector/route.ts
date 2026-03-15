import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { matchTranscriptChunks } from '@/app/lib/vectorSearch'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

    const emb = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: 'How would you prioritize features for an AI product?',
    })

    const embedding = emb.data[0].embedding

    // Call PostgREST directly to debug
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const rpcUrl = `${supabaseUrl}/rest/v1/rpc/match_transcript_chunks`

    const vecStr = '[' + embedding.join(',') + ']'
    const body = JSON.stringify({
      query_embedding: vecStr,
      match_count: 3,
      similarity_threshold: 0.0,
    })

    const rpcRes = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body,
      cache: 'no-store',
    })

    const rpcText = await rpcRes.text()

    // Also try via helper
    let helperResult: any[] = []
    let helperError: string | null = null
    try {
      helperResult = await matchTranscriptChunks(embedding, 3, 0.0)
    } catch (e: any) {
      helperError = e.message
    }

    return NextResponse.json({
      embedding_length: embedding.length,
      embedding_sample: embedding.slice(0, 3),
      vec_str_preview: vecStr.substring(0, 80),
      rpc_status: rpcRes.status,
      rpc_response_preview: rpcText.substring(0, 500),
      helper_count: helperResult.length,
      helper_error: helperError,
      env: {
        has_supabase_url: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        supabase_url: supabaseUrl,
        has_service_key: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        key_preview: key.substring(0, 20) + '...',
      }
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message, stack: error.stack?.split('\n').slice(0, 3) }, { status: 500 })
  }
}
