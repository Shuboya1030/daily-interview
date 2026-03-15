"""
AI Pulse — YouTube transcript extraction.

Uses youtube-transcript-api v1.x (free, no API key needed).
Note: YouTube blocks cloud provider IPs — run from local machine or use proxies.
"""
import logging
from typing import Optional, Dict

from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import (
    NoTranscriptFound,
    RequestBlocked,
)

logger = logging.getLogger("youtube.transcripts")

# Singleton instance (v1.x requires instantiation)
_api = YouTubeTranscriptApi()


def fetch_transcript(video_id: str) -> Optional[Dict]:
    """
    Fetch transcript for a single YouTube video.

    Tries English first, then auto-generated, then any available language.

    Returns:
        {"language": "en", "full_text": "...", "token_count": N}
        or None if no transcript is available.
    """
    try:
        transcript_list = _api.list(video_id)

        # Try manually created English first
        transcript = None
        lang = "en"
        try:
            transcript = transcript_list.find_manually_created_transcript(["en"])
        except NoTranscriptFound:
            pass

        # Fall back to auto-generated English
        if transcript is None:
            try:
                transcript = transcript_list.find_generated_transcript(["en"])
                lang = "en-auto"
            except NoTranscriptFound:
                pass

        # Fall back to any available transcript
        if transcript is None:
            for t in transcript_list:
                transcript = t
                lang = t.language_code
                break

        if transcript is None:
            logger.warning(f"No transcript found for {video_id}")
            return None

        entries = transcript.fetch()
        full_text = " ".join(e.text for e in entries)

        # Rough token estimate: ~4 chars per token
        token_count = len(full_text) // 4

        return {
            "language": lang,
            "full_text": full_text,
            "token_count": token_count,
        }

    except RequestBlocked:
        logger.warning(
            f"YouTube blocked transcript request for {video_id}. "
            "Run from a residential IP or use a proxy."
        )
        return None
    except Exception as e:
        logger.error(f"Error fetching transcript for {video_id}: {e}")
        return None


def fetch_transcripts_batch(video_ids: list) -> Dict[str, Dict]:
    """
    Fetch transcripts for multiple videos.

    Returns:
        {video_id: {"language": ..., "full_text": ..., "token_count": ...}}
    """
    results = {}
    for vid in video_ids:
        t = fetch_transcript(vid)
        if t:
            results[vid] = t
        else:
            logger.info(f"  Skipping {vid} — no transcript")
    return results
