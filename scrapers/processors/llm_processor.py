"""
LLM-based question processor: translation + multi-label classification.

For each raw question:
1. Detect language, translate to English if needed
2. Classify into one or more question types
"""
import json
import logging
from typing import List, Dict
from openai import OpenAI

from config import OPENAI_API_KEY

logger = logging.getLogger("LLMProcessor")

LLM_MODEL = "gpt-4o-mini"
BATCH_SIZE = 20  # questions per LLM call

QUESTION_TYPES = [
    "Behavioral",
    "Product Design",
    "Product Strategy",
    "Metrics",
    "Technical",
    "Estimation",
    "Execution",
    "AI Domain",
]

SYSTEM_PROMPT = f"""You are a PM interview question analyst. For each question provided, return:
1. "english": The question in English. If it's already English, return it as-is. If it's in another language, translate it naturally.
2. "types": A list of applicable question types from EXACTLY this set: {json.dumps(QUESTION_TYPES)}
   - A question can have 1-3 types. Only assign types that clearly apply.
   - "AI Domain" applies to questions specifically about AI/ML concepts, LLMs, recommendation systems, computer vision, NLP, hallucination, bias in AI, etc.
   - "Product Design" applies to questions asking to design, build, or improve a product.
   - "Product Strategy" applies to market entry, competition, pricing, go-to-market, growth.
   - "Metrics" applies to KPIs, measurement, success metrics, A/B testing.
   - "Behavioral" applies to past experience, leadership, conflict, teamwork.
   - "Technical" applies to system design, APIs, architecture, data pipelines.
   - "Estimation" applies to market sizing, fermi estimation, "how many X".
   - "Execution" applies to prioritization, roadmap, trade-offs, goal setting.

Return a JSON array where each element has "index", "english", and "types".
Example: [{{"index": 0, "english": "How would you design...", "types": ["Product Design"]}}]
Return ONLY the JSON array, no other text."""


class LLMProcessor:
    """Translate and classify questions using LLM"""

    def __init__(self):
        self.client = OpenAI(api_key=OPENAI_API_KEY)

    def process_questions(self, questions: List[Dict]) -> List[Dict]:
        """
        Process a list of raw questions: translate + classify.

        Args:
            questions: List of dicts with at least 'id' and 'content'

        Returns:
            List of dicts with 'id', 'english_content', 'llm_types'
        """
        results = []

        for i in range(0, len(questions), BATCH_SIZE):
            batch = questions[i:i + BATCH_SIZE]
            batch_num = i // BATCH_SIZE + 1
            total_batches = (len(questions) + BATCH_SIZE - 1) // BATCH_SIZE
            logger.info(f"LLM processing batch {batch_num}/{total_batches} ({len(batch)} questions)")

            batch_results = self._process_batch(batch)
            results.extend(batch_results)

        return results

    def _process_batch(self, batch: List[Dict]) -> List[Dict]:
        """Process a single batch of questions via LLM"""
        # Build the user message with numbered questions
        lines = []
        for idx, q in enumerate(batch):
            lines.append(f"[{idx}] {q['content']}")
        user_message = "\n".join(lines)

        try:
            response = self.client.chat.completions.create(
                model=LLM_MODEL,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_message},
                ],
                temperature=0.0,
                max_tokens=4000,
            )

            content = response.choices[0].message.content.strip()
            # Strip markdown code fences if present
            if content.startswith("```"):
                content = content.split("\n", 1)[1]
                if content.endswith("```"):
                    content = content[:-3]
                content = content.strip()

            parsed = json.loads(content)

            results = []
            for item in parsed:
                idx = item["index"]
                if idx < len(batch):
                    results.append({
                        "id": batch[idx]["id"],
                        "english_content": item["english"].strip(),
                        "llm_types": [t for t in item["types"] if t in QUESTION_TYPES],
                    })

            # Handle any questions the LLM missed
            processed_ids = {r["id"] for r in results}
            for q in batch:
                if q["id"] not in processed_ids:
                    logger.warning(f"LLM missed question {q['id']}, using original content")
                    results.append({
                        "id": q["id"],
                        "english_content": q["content"],
                        "llm_types": [],
                    })

            return results

        except Exception as e:
            logger.error(f"LLM batch failed: {str(e)}")
            # Fallback: return originals unprocessed
            return [
                {
                    "id": q["id"],
                    "english_content": q["content"],
                    "llm_types": [],
                }
                for q in batch
            ]
