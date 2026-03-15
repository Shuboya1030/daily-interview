"""
AI Pulse — LLM-based insight extraction from transcripts.

Extracts high-level abstractions, not tutorials or how-tos.
"""
import json
import logging
from typing import Dict, List, Optional

from openai import OpenAI

from youtube.config import OPENAI_API_KEY

logger = logging.getLogger("youtube.insights")

client = OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None

SYSTEM_PROMPT = """You are an expert at extracting high-level insights from AI-related video transcripts. Your audience is product managers preparing for AI-focused interviews.

For each transcript, extract:
1. **topic_summary**: A 1-2 sentence summary of what this video is fundamentally about.
2. **insights**: A list of 3-8 high-level abstract insights. These should be conceptual understandings, frameworks, or mental models — NOT step-by-step instructions or tool tutorials. Each insight should be a self-contained statement that a PM could use in an interview.
3. **concepts**: A list of key AI/tech concepts mentioned (e.g., "RAG", "fine-tuning", "hallucination", "RLHF", "embedding", "transformer").
4. **pm_relevance**: A score from 0.0 to 1.0 indicating how relevant this content is to PM interviews (1.0 = directly about PM/AI strategy, 0.0 = pure engineering with no PM angle).

Examples of GOOD insights (high-level, abstract):
- "RAG is preferable to fine-tuning when your knowledge base changes frequently, because fine-tuning bakes knowledge into model weights while RAG keeps it external and updatable."
- "The key metric for evaluating LLM applications is not accuracy alone, but the cost of errors — a wrong medical diagnosis is catastrophically different from a wrong movie recommendation."

Examples of BAD insights (too operational, tutorial-like):
- "First install LangChain, then configure your vector store with Pinecone."
- "Click the settings button and select GPT-4 from the dropdown."

Return valid JSON only."""

USER_PROMPT_TRANSCRIPT = """Extract insights from this video transcript.

Video title: {title}
Channel: {channel}

Transcript (may be truncated):
{transcript}

Return JSON:
{{
  "topic_summary": "...",
  "insights": ["insight 1", "insight 2", ...],
  "concepts": ["concept1", "concept2", ...],
  "pm_relevance": 0.0-1.0
}}"""

USER_PROMPT_METADATA = """Extract insights from this video based on its title and description. Since no transcript is available, focus on what you can reasonably infer.

Video title: {title}
Channel: {channel}
Views: {views:,}
Description:
{description}

Return JSON:
{{
  "topic_summary": "...",
  "insights": ["insight 1", "insight 2", ...],
  "concepts": ["concept1", "concept2", ...],
  "pm_relevance": 0.0-1.0
}}"""

# Max transcript chars to send (to stay within context limits)
MAX_TRANSCRIPT_CHARS = 80000


def extract_insights(video: Dict, transcript_text: Optional[str] = None) -> Optional[Dict]:
    """
    Extract insights from a video transcript or metadata.

    Args:
        video: dict with 'title', 'channel_name', 'description', 'views'
        transcript_text: full transcript string, or None to use metadata only

    Returns:
        {"topic_summary": ..., "insights": [...], "concepts": [...], "pm_relevance": float}
        or None on failure.
    """
    if not client:
        logger.error("OpenAI client not initialized -- set OPENAI_API_KEY")
        return None

    if transcript_text:
        truncated = transcript_text[:MAX_TRANSCRIPT_CHARS]
        user_msg = USER_PROMPT_TRANSCRIPT.format(
            title=video.get("title", ""),
            channel=video.get("channel_name", ""),
            transcript=truncated,
        )
    else:
        user_msg = USER_PROMPT_METADATA.format(
            title=video.get("title", ""),
            channel=video.get("channel_name", ""),
            views=video.get("views", 0),
            description=video.get("description", "")[:5000],
        )

    try:
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.2,
            response_format={"type": "json_object"},
        )

        raw = resp.choices[0].message.content
        data = json.loads(raw)

        return {
            "topic_summary": data.get("topic_summary", ""),
            "insights": data.get("insights", []),
            "concepts": data.get("concepts", []),
            "pm_relevance": float(data.get("pm_relevance", 0.5)),
            "source": "transcript" if transcript_text else "metadata",
        }

    except Exception as e:
        logger.error(f"Insight extraction failed for '{video.get('title', '?')}': {e}")
        return None


def extract_insights_batch(videos_with_transcripts: List[Dict]) -> List[Dict]:
    """
    Extract insights for multiple videos.

    Args:
        List of dicts with keys: video (dict), transcript_text (str)

    Returns:
        List of dicts: {video_id, topic_summary, insights, concepts, pm_relevance}
    """
    results = []
    for item in videos_with_transcripts:
        video = item["video"]
        transcript = item["transcript_text"]

        logger.info(f"Extracting insights: {video['title'][:60]}...")
        data = extract_insights(video, transcript)

        if data:
            data["video_id"] = video["video_id"]
            results.append(data)

    logger.info(f"Extracted insights for {len(results)}/{len(videos_with_transcripts)} videos")
    return results
