import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import postgres from "https://deno.land/x/postgresjs@v3.4.5/mod.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const dbUrl = Deno.env.get("SUPABASE_DB_URL")!;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const sql = postgres(dbUrl, { max: 1 });

  try {
    const { embedding, match_count = 10, similarity_threshold = 0.1 } = await req.json();

    if (!embedding || !Array.isArray(embedding) || embedding.length !== 1536) {
      return new Response(
        JSON.stringify({ error: "embedding must be a 1536-dim array" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const vecStr = `[${embedding.join(",")}]`;
    const minSim = Number(similarity_threshold);
    const limit = Number(match_count);

    // Use subquery to avoid pgvector index scan issues with ORDER BY <=>
    const rows = await sql.unsafe(
      `SELECT * FROM (
        SELECT tc.id, tc.video_id, tc.chunk_index, tc.chunk_text, tc.token_count,
               (1 - (tc.embedding <=> '${vecStr}'::vector(1536)))::double precision AS similarity,
               yv.title AS video_title, yv.channel_name, yv.url AS video_url
        FROM transcript_chunks tc
        JOIN youtube_videos yv ON tc.video_id = yv.id
      ) sub
      WHERE similarity > ${minSim}
      ORDER BY similarity DESC
      LIMIT ${limit}`
    );

    return new Response(JSON.stringify(rows), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } finally {
    await sql.end();
  }
});
