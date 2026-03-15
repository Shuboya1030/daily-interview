"""
AI Pulse — YouTube video discovery via Data API v3.

Fetches recent videos from starter channels and top search results.
"""
import logging
import re
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Optional

from googleapiclient.discovery import build

from youtube.config import (
    YOUTUBE_API_KEY,
    STARTER_CHANNELS,
    SEARCH_QUERIES,
    VIDEOS_PER_CHANNEL,
    SEARCH_RESULTS_PER_QUERY,
    MAX_AGE_DAYS,
)

logger = logging.getLogger("youtube.discovery")


def _build_youtube():
    """Build the YouTube Data API client."""
    return build("youtube", "v3", developerKey=YOUTUBE_API_KEY)


def _parse_duration(iso: str) -> int:
    """Convert ISO 8601 duration (PT1H2M3S) to seconds."""
    m = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", iso or "")
    if not m:
        return 0
    h, mi, s = (int(g) if g else 0 for g in m.groups())
    return h * 3600 + mi * 60 + s


def _resolve_channel_id(youtube, handle: str) -> Optional[str]:
    """Resolve a @handle to a channel ID."""
    # Try the search endpoint (works for handles)
    resp = youtube.search().list(
        part="snippet",
        q=handle,
        type="channel",
        maxResults=1,
    ).execute()
    items = resp.get("items", [])
    if items:
        return items[0]["snippet"]["channelId"]
    return None


def _fetch_channel_videos(youtube, channel_id: str, max_results: int,
                          published_after: str) -> List[Dict]:
    """Fetch recent videos from a single channel."""
    videos = []
    request = youtube.search().list(
        part="snippet",
        channelId=channel_id,
        type="video",
        order="date",
        maxResults=min(max_results, 50),
        publishedAfter=published_after,
    )
    resp = request.execute()

    for item in resp.get("items", []):
        vid = item["id"].get("videoId")
        if not vid:
            continue
        snippet = item["snippet"]
        videos.append({
            "video_id": vid,
            "title": snippet["title"],
            "channel_name": snippet["channelTitle"],
            "channel_id": channel_id,
            "url": f"https://www.youtube.com/watch?v={vid}",
            "thumbnail_url": snippet["thumbnails"].get("high", {}).get("url", ""),
            "description": snippet.get("description", ""),
            "published_at": snippet["publishedAt"],
        })

    return videos


def _enrich_with_stats(youtube, videos: List[Dict]) -> List[Dict]:
    """Batch-fetch view/like/comment counts, duration, and full descriptions."""
    if not videos:
        return videos

    # YouTube API allows up to 50 IDs per request
    ids = [v["video_id"] for v in videos]
    for i in range(0, len(ids), 50):
        batch = ids[i:i + 50]
        resp = youtube.videos().list(
            part="snippet,statistics,contentDetails",
            id=",".join(batch),
        ).execute()

        stats_map = {}
        for item in resp.get("items", []):
            s = item["statistics"]
            stats_map[item["id"]] = {
                "views": int(s.get("viewCount", 0)),
                "likes": int(s.get("likeCount", 0)),
                "comments": int(s.get("commentCount", 0)),
                "duration_seconds": _parse_duration(
                    item["contentDetails"].get("duration", "")
                ),
                # Full description from videos.list (search API truncates it)
                "description": item["snippet"].get("description", ""),
            }

        for v in videos:
            if v["video_id"] in stats_map:
                v.update(stats_map[v["video_id"]])

    return videos


def _search_top_videos(youtube, query: str, max_results: int,
                       published_after: str) -> List[Dict]:
    """Search YouTube for top videos matching a query."""
    resp = youtube.search().list(
        part="snippet",
        q=query,
        type="video",
        order="relevance",
        maxResults=min(max_results, 50),
        publishedAfter=published_after,
    ).execute()

    videos = []
    for item in resp.get("items", []):
        vid = item["id"].get("videoId")
        if not vid:
            continue
        snippet = item["snippet"]
        videos.append({
            "video_id": vid,
            "title": snippet["title"],
            "channel_name": snippet["channelTitle"],
            "channel_id": snippet["channelId"],
            "url": f"https://www.youtube.com/watch?v={vid}",
            "thumbnail_url": snippet["thumbnails"].get("high", {}).get("url", ""),
            "description": snippet.get("description", ""),
            "published_at": snippet["publishedAt"],
        })

    return videos


def discover_videos(skip_existing_channels: bool = False) -> List[Dict]:
    """
    Main discovery entrypoint.

    1. Fetch recent videos from each starter channel
    2. Search for top AI videos by query
    3. Deduplicate by video_id
    4. Enrich with engagement stats

    Args:
        skip_existing_channels: If True, skip channels that already have videos in DB.

    Returns list of video dicts ready for DB insertion.
    """
    from youtube.db import VideoDB

    youtube = _build_youtube()
    cutoff = (datetime.now(timezone.utc) - timedelta(days=MAX_AGE_DAYS)).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )

    # Get existing video IDs and channel names from DB
    existing_ids = VideoDB.get_existing_video_ids()
    existing_channels = set()
    if skip_existing_channels:
        existing_channels = VideoDB.get_existing_channel_names()
        logger.info(f"Skipping {len(existing_channels)} channels already in DB")

    all_videos: Dict[str, Dict] = {}

    # --- Starter channels ---
    for ch in STARTER_CHANNELS:
        if skip_existing_channels and ch['name'] in existing_channels:
            logger.info(f"SKIP {ch['name']} (already in DB)")
            continue

        logger.info(f"Fetching videos from {ch['name']} ({ch['handle']})")
        try:
            channel_id = _resolve_channel_id(youtube, ch["handle"])
            if not channel_id:
                logger.warning(f"Could not resolve channel: {ch['handle']}")
                continue

            vids = _fetch_channel_videos(
                youtube, channel_id, VIDEOS_PER_CHANNEL, cutoff
            )
            new = 0
            for v in vids:
                if v["video_id"] not in existing_ids:
                    all_videos[v["video_id"]] = v
                    new += 1

            logger.info(f"  Found {len(vids)} videos, {new} new")
        except Exception as e:
            logger.error(f"  Error fetching {ch['handle']}: {e}")

    # --- Search queries (skip if only doing incremental) ---
    if not skip_existing_channels:
        for query in SEARCH_QUERIES:
            logger.info(f"Searching: '{query}'")
            try:
                vids = _search_top_videos(
                    youtube, query, SEARCH_RESULTS_PER_QUERY, cutoff
                )
                new = 0
                for v in vids:
                    if v["video_id"] not in all_videos and v["video_id"] not in existing_ids:
                        all_videos[v["video_id"]] = v
                        new += 1
                logger.info(f"  Found {len(vids)} results, {new} new")
            except Exception as e:
                logger.error(f"  Error searching '{query}': {e}")
    else:
        logger.info("Skipping search queries (incremental mode)")

    # --- Enrich with stats ---
    videos = list(all_videos.values())
    logger.info(f"Enriching {len(videos)} unique videos with stats...")
    videos = _enrich_with_stats(youtube, videos)

    # Filter out shorts (< 60s)
    videos = [v for v in videos if v.get("duration_seconds", 0) >= 60]

    logger.info(f"Discovery complete: {len(videos)} videos")
    return videos
