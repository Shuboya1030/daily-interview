DROP FUNCTION IF EXISTS match_transcript_chunks(text, integer, double precision);
DROP FUNCTION IF EXISTS match_transcript_chunks(vector, integer, double precision);

CREATE OR REPLACE FUNCTION match_transcript_chunks(
  query_embedding text,
  match_count integer DEFAULT 10,
  similarity_threshold double precision DEFAULT 0.3
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
LANGUAGE plpgsql
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
  USING query_embedding, similarity_threshold, match_count;
END;
$fn$;
