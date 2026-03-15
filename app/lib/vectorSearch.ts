import { Pool } from 'pg'

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

let pool: Pool | null = null

function getPool(): Pool {
  if (!pool) {
    // Use session mode pooler (port 6543) for pgvector compatibility
    const dbUrl = process.env.DATABASE_URL || ''
    const sessionUrl = dbUrl.includes(':6543') ? dbUrl : dbUrl.replace(':5432/', ':6543/')
    pool = new Pool({
      connectionString: sessionUrl + (sessionUrl.includes('?') ? '&' : '?') + 'pgbouncer=true',
      ssl: { rejectUnauthorized: false },
      max: 3,
      idleTimeoutMillis: 10000,
    })
  }
  return pool
}

export async function matchTranscriptChunks(
  embedding: number[],
  matchCount = 10,
  similarityThreshold = 0.1
): Promise<ChunkResult[]> {
  const vecStr = '[' + embedding.join(',') + ']'

  // Use text interpolation to avoid PgBouncer/pgvector parameter binding issues
  // The vector string only contains numbers, brackets, commas, and dots — safe to interpolate
  const sql = `
    SELECT tc.id, tc.video_id, tc.chunk_index, tc.chunk_text, tc.token_count,
           (1 - (tc.embedding <=> '${vecStr}'::vector(1536)))::double precision AS similarity,
           yv.title AS video_title, yv.channel_name, yv.url AS video_url
    FROM transcript_chunks tc
    JOIN youtube_videos yv ON tc.video_id = yv.id
    WHERE (1 - (tc.embedding <=> '${vecStr}'::vector(1536))) > ${similarityThreshold}
    ORDER BY tc.embedding <=> '${vecStr}'::vector(1536)
    LIMIT ${matchCount}`

  const { rows } = await getPool().query(sql)
  return rows as ChunkResult[]
}
