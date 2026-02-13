"""
GPT-based similarity detection for questions
"""
import openai
from typing import List, Dict, Optional, Tuple
import logging
import json
from tenacity import retry, stop_after_attempt, wait_exponential

from config import (
    OPENAI_API_KEY,
    GPT_MODEL,
    SIMILARITY_THRESHOLD,
    GPT_TEMPERATURE,
    GPT_MAX_TOKENS
)

openai.api_key = OPENAI_API_KEY
logger = logging.getLogger("Similarity")


class SimilarityDetector:
    """Detect similarity between questions using GPT"""

    def __init__(self, threshold: float = SIMILARITY_THRESHOLD):
        self.threshold = threshold
        self.client = openai.OpenAI(api_key=OPENAI_API_KEY)

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=4, max=10)
    )
    def calculate_similarity(self, question1: str, question2: str) -> float:
        """
        Calculate similarity between two questions using GPT

        Returns:
            Similarity score between 0 and 1
        """
        prompt = f"""You are an expert at comparing Product Manager interview questions.
Compare the following two questions and determine their semantic similarity.

Question 1: {question1}

Question 2: {question2}

Are these essentially the same question, just worded differently?
Consider:
- Are they asking for the same type of response?
- Would they have similar answers?
- Are they testing the same skill/knowledge?

Respond with ONLY a JSON object in this exact format:
{{"similarity_score": <float between 0 and 1>, "reasoning": "<brief explanation>"}}

Where:
- 1.0 = Identical questions (same meaning, just different wording)
- 0.8-0.9 = Very similar (minor differences in scope or focus)
- 0.5-0.7 = Somewhat similar (related topic but different angle)
- 0-0.4 = Different questions

Examples:
- "What's your favorite product?" and "Tell me about a product you love" → 0.95
- "Design a product for drivers" and "Design a product for commuters" → 0.85
- "Design a product" and "Improve an existing product" → 0.50
"""

        try:
            response = self.client.chat.completions.create(
                model=GPT_MODEL,
                messages=[
                    {"role": "system", "content": "You are a precise similarity comparison expert. Always respond with valid JSON."},
                    {"role": "user", "content": prompt}
                ],
                temperature=GPT_TEMPERATURE,
                max_tokens=GPT_MAX_TOKENS
            )

            content = response.choices[0].message.content.strip()

            # Parse JSON response
            result = json.loads(content)
            similarity = float(result['similarity_score'])

            logger.debug(f"Similarity: {similarity:.2f} - {result.get('reasoning', '')}")

            return similarity

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse GPT response as JSON: {content}")
            # Fallback: try to extract number
            import re
            match = re.search(r'"similarity_score":\s*([0-9.]+)', content)
            if match:
                return float(match.group(1))
            return 0.0

        except Exception as e:
            logger.error(f"Error calculating similarity: {str(e)}")
            return 0.0

    def find_similar_question(
        self,
        new_question: str,
        existing_questions: List[Dict]
    ) -> Optional[Tuple[str, float]]:
        """
        Find if new question is similar to any existing question

        Args:
            new_question: New question content
            existing_questions: List of existing merged questions

        Returns:
            Tuple of (merged_question_id, similarity_score) if found, else None
        """
        if not existing_questions:
            return None

        logger.info(f"Comparing new question against {len(existing_questions)} existing questions")

        # Simple optimization: only compare if question types match
        # (implement later when we have reliable question types)

        for existing in existing_questions:
            existing_content = existing['canonical_content']

            # Quick pre-filter: if questions are very different in length, skip
            len_ratio = len(new_question) / max(len(existing_content), 1)
            if len_ratio < 0.5 or len_ratio > 2.0:
                continue

            similarity = self.calculate_similarity(new_question, existing_content)

            if similarity >= self.threshold:
                logger.info(f"Found similar question! Similarity: {similarity:.2f}")
                return (existing['id'], similarity)

        logger.info("No similar question found")
        return None

    def batch_find_similar(
        self,
        new_questions: List[Dict],
        existing_questions: List[Dict]
    ) -> Dict[str, Optional[Tuple[str, float]]]:
        """
        Batch process multiple new questions

        Returns:
            Dict mapping new_question_id -> (merged_question_id, similarity) or None
        """
        results = {}

        for i, new_q in enumerate(new_questions):
            logger.info(f"Processing question {i+1}/{len(new_questions)}")

            similar = self.find_similar_question(
                new_q['content'],
                existing_questions
            )

            results[new_q['id']] = similar

        return results
