export interface ChunkResult {
  id: string
  video_id: string
  chunk_index: number
  chunk_text: string
  token_count: number
  similarity: number
  video_title: string
  channel_name: string
  video_url: string
}

export async function matchTranscriptChunks(
  embedding: number[],
  matchCount = 10,
  similarityThreshold = 0.15
): Promise<ChunkResult[]> {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/match_transcript_chunks`
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  const body = JSON.stringify({
    query_embedding: '[' + embedding.join(',') + ']',
    match_count: matchCount,
    similarity_threshold: similarityThreshold,
  })

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: 'return=representation',
    },
    body,
    cache: 'no-store',
  })

  const text = await res.text()

  if (!res.ok) {
    console.error('Vector search failed:', res.status, text)
    throw new Error(`Vector search failed: ${text}`)
  }

  try {
    return JSON.parse(text)
  } catch {
    console.error('Vector search parse error:', text.slice(0, 200))
    return []
  }
}
