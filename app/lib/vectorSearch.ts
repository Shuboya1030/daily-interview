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
  similarityThreshold = 0.1
): Promise<ChunkResult[]> {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/vector-search`
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      embedding,
      match_count: matchCount,
      similarity_threshold: similarityThreshold,
    }),
    cache: 'no-store',
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Vector search failed: ${err}`)
  }

  return res.json()
}
