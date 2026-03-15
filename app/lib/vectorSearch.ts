import { Client } from 'pg'

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
  // Build vector string — only contains numbers, brackets, commas, dots, minus signs
  const vecStr = '[' + embedding.join(',') + ']'
  // Use direct database connection (not pooler) for pgvector compatibility
  const dbUrl = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL || ''

  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  })

  try {
    await client.connect()

    // Use simple query (no parameters) to bypass PgBouncer extended protocol issues with pgvector
    const { rows } = await client.query(
      `SELECT tc.id, tc.video_id, tc.chunk_index, tc.chunk_text, tc.token_count,
              (1 - (tc.embedding <=> '${vecStr}'::vector(1536)))::double precision AS similarity,
              yv.title AS video_title, yv.channel_name, yv.url AS video_url
       FROM transcript_chunks tc
       JOIN youtube_videos yv ON tc.video_id = yv.id
       WHERE (1 - (tc.embedding <=> '${vecStr}'::vector(1536))) > ${Number(similarityThreshold)}
       ORDER BY tc.embedding <=> '${vecStr}'::vector(1536)
       LIMIT ${Number(matchCount)}`
    )

    return rows as ChunkResult[]
  } finally {
    await client.end().catch(() => {})
  }
}
