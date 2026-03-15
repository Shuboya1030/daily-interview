"""
AI Pulse — Database operations for YouTube videos, transcripts, and insights.
"""
import json
import logging
from contextlib import contextmanager
from typing import Dict, List, Set

import psycopg2
from psycopg2.extras import RealDictCursor, execute_values

from youtube.config import DATABASE_URL

logger = logging.getLogger("youtube.db")


@contextmanager
def get_conn():
    conn = psycopg2.connect(DATABASE_URL)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


class VideoDB:
    """Database operations for AI Pulse."""

    @staticmethod
    def get_existing_video_ids() -> Set[str]:
        """Return set of YouTube video IDs already in DB."""
        with get_conn() as conn:
            cur = conn.cursor()
            cur.execute("SELECT video_id FROM youtube_videos")
            ids = {row[0] for row in cur.fetchall()}
            cur.close()
            return ids

    @staticmethod
    def get_existing_channel_names() -> Set[str]:
        """Return set of channel names already in DB."""
        with get_conn() as conn:
            cur = conn.cursor()
            cur.execute("SELECT DISTINCT channel_name FROM youtube_videos")
            names = {row[0] for row in cur.fetchall()}
            cur.close()
            return names

    @staticmethod
    def upsert_videos(videos: List[Dict]) -> int:
        """Insert or update videos. Returns count of affected rows."""
        if not videos:
            return 0

        with get_conn() as conn:
            cur = conn.cursor()

            query = """
            INSERT INTO youtube_videos
                (video_id, title, channel_name, channel_id, url,
                 thumbnail_url, description, views, likes, comments,
                 duration_seconds, published_at)
            VALUES %s
            ON CONFLICT (video_id) DO UPDATE SET
                title = EXCLUDED.title,
                description = EXCLUDED.description,
                views = EXCLUDED.views,
                likes = EXCLUDED.likes,
                comments = EXCLUDED.comments,
                duration_seconds = EXCLUDED.duration_seconds
            """

            values = [
                (
                    v["video_id"],
                    v["title"],
                    v.get("channel_name"),
                    v.get("channel_id"),
                    v["url"],
                    v.get("thumbnail_url"),
                    v.get("description", ""),
                    v.get("views", 0),
                    v.get("likes", 0),
                    v.get("comments", 0),
                    v.get("duration_seconds", 0),
                    v.get("published_at"),
                )
                for v in videos
            ]

            execute_values(cur, query, values)
            count = cur.rowcount
            cur.close()
            return count

    @staticmethod
    def get_video_uuid(video_id: str) -> str:
        """Get the internal UUID for a YouTube video_id."""
        with get_conn() as conn:
            cur = conn.cursor()
            cur.execute(
                "SELECT id FROM youtube_videos WHERE video_id = %s", (video_id,)
            )
            row = cur.fetchone()
            cur.close()
            return str(row[0]) if row else None

    @staticmethod
    def get_videos_without_transcripts() -> List[Dict]:
        """Get videos that don't have transcripts yet."""
        with get_conn() as conn:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute("""
                SELECT yv.id, yv.video_id, yv.title, yv.channel_name
                FROM youtube_videos yv
                LEFT JOIN video_transcripts vt ON yv.id = vt.video_id
                WHERE vt.id IS NULL
                ORDER BY yv.views DESC
            """)
            rows = cur.fetchall()
            cur.close()
            return [dict(r) for r in rows]

    @staticmethod
    def insert_transcript(video_uuid: str, language: str, full_text: str,
                          token_count: int):
        """Insert a transcript for a video."""
        with get_conn() as conn:
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO video_transcripts (video_id, language, full_text, token_count)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (video_id, language) DO UPDATE SET
                    full_text = EXCLUDED.full_text,
                    token_count = EXCLUDED.token_count,
                    extracted_at = NOW()
            """, (video_uuid, language, full_text, token_count))
            cur.close()

    @staticmethod
    def get_videos_without_insights() -> List[Dict]:
        """Get videos without insights. Includes transcript if available."""
        with get_conn() as conn:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute("""
                SELECT yv.id, yv.video_id, yv.title, yv.channel_name,
                       yv.description, yv.views,
                       vt.full_text AS transcript_text
                FROM youtube_videos yv
                LEFT JOIN video_transcripts vt ON yv.id = vt.video_id
                LEFT JOIN video_insights vi ON yv.id = vi.video_id
                WHERE vi.id IS NULL
                ORDER BY yv.views DESC
            """)
            rows = cur.fetchall()
            cur.close()
            return [dict(r) for r in rows]

    @staticmethod
    def insert_insight(video_uuid: str, topic_summary: str,
                       insights: list, concepts: list, pm_relevance: float):
        """Insert LLM-extracted insights for a video."""
        with get_conn() as conn:
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO video_insights
                    (video_id, topic_summary, insights, concepts, pm_relevance)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (video_id) DO UPDATE SET
                    topic_summary = EXCLUDED.topic_summary,
                    insights = EXCLUDED.insights,
                    concepts = EXCLUDED.concepts,
                    pm_relevance = EXCLUDED.pm_relevance,
                    processed_at = NOW()
            """, (video_uuid, topic_summary, json.dumps(insights),
                  concepts, pm_relevance))
            cur.close()

    @staticmethod
    def get_all_videos_with_insights() -> List[Dict]:
        """Get all videos joined with their insights (for the website)."""
        with get_conn() as conn:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute("""
                SELECT
                    yv.id, yv.video_id, yv.title, yv.channel_name,
                    yv.url, yv.thumbnail_url, yv.views, yv.likes,
                    yv.comments, yv.duration_seconds, yv.published_at,
                    vi.topic_summary, vi.insights, vi.concepts, vi.pm_relevance
                FROM youtube_videos yv
                LEFT JOIN video_insights vi ON yv.id = vi.video_id
                WHERE yv.is_relevant = true
                ORDER BY yv.views DESC
            """)
            rows = cur.fetchall()
            cur.close()
            return [dict(r) for r in rows]

    @staticmethod
    def get_stats() -> Dict:
        """Get counts for logging."""
        with get_conn() as conn:
            cur = conn.cursor()
            stats = {}
            for table in ["youtube_videos", "video_transcripts", "video_insights"]:
                cur.execute(f"SELECT COUNT(*) FROM {table}")
                stats[table] = cur.fetchone()[0]
            cur.close()
            return stats
