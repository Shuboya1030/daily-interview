"""
Chunk video transcripts and generate embeddings for RAG vector search.

One-time setup script (incremental — safe to re-run).
Reads from video_transcripts, writes to transcript_chunks.

Usage:
    python chunk_and_embed.py              # Process all un-chunked transcripts
    python chunk_and_embed.py --rebuild    # Drop and rebuild all chunks

Requirements:
    pip install psycopg2-binary openai python-dotenv
"""
import argparse
import json
import os
import sys
import time

from dotenv import load_dotenv
load_dotenv()
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '.env.local'))

import psycopg2
from psycopg2.extras import RealDictCursor
from openai import OpenAI

# Configuration
DATABASE_URL = os.getenv('DATABASE_URL')
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')
EMBEDDING_MODEL = "text-embedding-3-small"  # 1536 dimensions
CHUNK_SIZE_WORDS = 500
CHUNK_OVERLAP_WORDS = 50
EMBEDDING_BATCH_SIZE = 100

client = OpenAI(api_key=OPENAI_API_KEY)


def chunk_transcript(full_text, chunk_size=CHUNK_SIZE_WORDS, overlap=CHUNK_OVERLAP_WORDS):
    """Split transcript into overlapping word-based chunks."""
    words = full_text.split()
    if len(words) <= chunk_size:
        return [full_text]

    chunks = []
    step = chunk_size - overlap
    for i in range(0, len(words), step):
        chunk_words = words[i:i + chunk_size]
        if len(chunk_words) < overlap and chunks:
            # Skip tiny trailing chunks
            break
        chunks.append(' '.join(chunk_words))

    return chunks


def generate_embeddings_batch(texts):
    """Generate embeddings for a list of texts in batches."""
    all_embeddings = []

    for i in range(0, len(texts), EMBEDDING_BATCH_SIZE):
        batch = texts[i:i + EMBEDDING_BATCH_SIZE]
        response = client.embeddings.create(
            model=EMBEDDING_MODEL,
            input=batch,
        )
        batch_embeddings = [item.embedding for item in response.data]
        all_embeddings.extend(batch_embeddings)

    return all_embeddings


def main():
    parser = argparse.ArgumentParser(description="Chunk transcripts and generate embeddings")
    parser.add_argument("--rebuild", action="store_true", help="Drop and rebuild all chunks")
    args = parser.parse_args()

    print("Connecting to database...")
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor(cursor_factory=RealDictCursor)

    # Rebuild mode: clear all existing chunks
    if args.rebuild:
        print("REBUILD mode: deleting all existing chunks...")
        cur.execute("DELETE FROM transcript_chunks")
        conn.commit()
        print("  Cleared.")

    # Fetch all transcripts with video info
    cur.execute('''
        SELECT yv.id as video_uuid, yv.video_id, yv.title, yv.channel_name,
               yv.views, vt.full_text, vt.token_count
        FROM youtube_videos yv
        JOIN video_transcripts vt ON yv.id = vt.video_id
        WHERE yv.is_relevant = true
        ORDER BY yv.views DESC
    ''')
    all_videos = cur.fetchall()

    # Check which videos already have chunks (incremental)
    cur.execute('SELECT DISTINCT video_id FROM transcript_chunks')
    existing_ids = {row['video_id'] for row in cur.fetchall()}

    videos = [v for v in all_videos if v['video_uuid'] not in existing_ids]
    print(f"Total videos with transcripts: {len(all_videos)}")
    print(f"Already chunked: {len(existing_ids)}")
    print(f"New to process: {len(videos)}\n")

    if not videos:
        print("Nothing new to chunk!")
        cur.close()
        conn.close()
        return

    total_chunks = 0
    total_tokens = 0

    for i, v in enumerate(videos, 1):
        print(f"[{i}/{len(videos)}] {v['title'][:60]}...", end=" ", flush=True)

        # Chunk the transcript
        chunks = chunk_transcript(v['full_text'])
        print(f"({len(chunks)} chunks)", end=" ", flush=True)

        if not chunks:
            print("SKIP - empty transcript")
            continue

        # Generate embeddings for all chunks
        try:
            embeddings = generate_embeddings_batch(chunks)
        except Exception as e:
            print(f"ERROR embedding: {e}")
            continue

        # Insert chunks + embeddings into DB
        for idx, (chunk_text, embedding) in enumerate(zip(chunks, embeddings)):
            token_count = len(chunk_text) // 4
            embedding_str = json.dumps(embedding)

            cur.execute('''
                INSERT INTO transcript_chunks (video_id, chunk_index, chunk_text, token_count, embedding)
                VALUES (%s, %s, %s, %s, %s::vector)
                ON CONFLICT (video_id, chunk_index) DO UPDATE SET
                    chunk_text = EXCLUDED.chunk_text,
                    token_count = EXCLUDED.token_count,
                    embedding = EXCLUDED.embedding,
                    created_at = NOW()
            ''', (str(v['video_uuid']), idx, chunk_text, token_count, embedding_str))

        conn.commit()
        total_chunks += len(chunks)
        total_tokens += sum(len(c) // 4 for c in chunks)
        print(f"OK")

        # Small delay to respect rate limits
        time.sleep(0.5)

    cur.close()
    conn.close()

    print(f"\n{'='*60}")
    print(f"CHUNKING COMPLETE")
    print(f"{'='*60}")
    print(f"Videos processed: {len(videos)}")
    print(f"Total chunks created: {total_chunks}")
    print(f"Total tokens: ~{total_tokens:,}")
    print(f"Avg chunks per video: {total_chunks / len(videos):.1f}")
    print(f"\nNext: update the API routes to use vector search!")


if __name__ == "__main__":
    main()
