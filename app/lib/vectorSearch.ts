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
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/search_chunks`
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const body = JSON.stringify({
    query_vec: '[' + embedding.join(',') + ']',
    k: matchCount,
    min_similarity: similarityThreshold,
  })

  // Retry up to 5 times — PgBouncer intermittently drops pgvector results
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body,
      cache: 'no-store',
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Vector search failed: ${err}`)
    }

    const results: ChunkResult[] = await res.json()
    if (results.length > 0) return results

    // Wait before retry
    await new Promise(r => setTimeout(r, 500 * (attempt + 1)))
  }

  return []
}
