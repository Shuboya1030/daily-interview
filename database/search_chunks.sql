DROP FUNCTION IF EXISTS search_chunks(text, integer, double precision);

CREATE OR REPLACE FUNCTION search_chunks(
  query_vec text,
  k integer DEFAULT 10,
  min_similarity double precision DEFAULT 0.1
)
RETURNS TABLE(
  id uuid,
  video_id uuid,
  chunk_index integer,
  chunk_text text,
  token_count integer,
  similarity double precision,
  video_title text,
  channel_name varchar,
  video_url text
)
LANGUAGE plpgsql STABLE
AS $fn$
BEGIN
  RETURN QUERY EXECUTE
    'SELECT tc.id, tc.video_id, tc.chunk_index, tc.chunk_text, tc.token_count,
            (1 - (tc.embedding <=> $1::vector(1536)))::double precision AS similarity,
            yv.title AS video_title, yv.channel_name, yv.url AS video_url
     FROM transcript_chunks tc
     JOIN youtube_videos yv ON tc.video_id = yv.id
     WHERE (1 - (tc.embedding <=> $1::vector(1536))) > $2
     ORDER BY tc.embedding <=> $1::vector(1536)
     LIMIT $3'
  USING query_vec, min_similarity, k;
END;
$fn$;

GRANT EXECUTE ON FUNCTION search_chunks(text, integer, double precision) TO anon, authenticated, service_role;
