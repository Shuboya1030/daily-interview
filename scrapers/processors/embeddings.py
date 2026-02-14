"""
Embedding-based similarity detection for questions

Uses OpenAI Embedding API to generate vectors, then cosine similarity
to find duplicate/similar questions across sources.
"""
import numpy as np
from typing import List, Dict, Tuple
import logging
from openai import OpenAI

from config import OPENAI_API_KEY

logger = logging.getLogger("Embeddings")

SIMILARITY_THRESHOLD = 0.80
EMBEDDING_MODEL = "text-embedding-3-small"
BATCH_SIZE = 100  # OpenAI supports up to 2048 inputs per request

# Canonical question types — only these are allowed in merged output
VALID_TYPES = {
    "AI Domain Knowledge", "Behavioral", "Metrics and Estimation",
    "Execution", "Product Design", "Product Strategy", "Technical",
}

# Map old/legacy type names to canonical names
TYPE_NORMALIZATION = {
    "Metrics": "Metrics and Estimation",
    "Estimation": "Metrics and Estimation",
    "AI Domain": "AI Domain Knowledge",
}


class EmbeddingProcessor:
    """Process questions using embeddings for similarity detection"""

    def __init__(self, threshold: float = SIMILARITY_THRESHOLD):
        self.threshold = threshold
        self.client = OpenAI(api_key=OPENAI_API_KEY)

    def generate_embeddings(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for a list of texts"""
        all_embeddings = []

        for i in range(0, len(texts), BATCH_SIZE):
            batch = texts[i:i + BATCH_SIZE]
            logger.info(f"Generating embeddings for batch {i//BATCH_SIZE + 1} ({len(batch)} texts)")

            response = self.client.embeddings.create(
                model=EMBEDDING_MODEL,
                input=batch
            )

            batch_embeddings = [item.embedding for item in response.data]
            all_embeddings.extend(batch_embeddings)

        return all_embeddings

    def cosine_similarity(self, a: List[float], b: List[float]) -> float:
        """Calculate cosine similarity between two vectors"""
        a = np.array(a)
        b = np.array(b)
        return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))

    def _get_embed_text(self, q: Dict) -> str:
        """Get the text to embed: prefer english_content over content"""
        return q.get('english_content') or q.get('content', '')

    def find_groups(self, questions: List[Dict]) -> List[List[Dict]]:
        """
        Group similar questions together using english_content for embedding.

        Args:
            questions: List of raw question dicts with 'id', 'content',
                       'english_content', 'source', etc.

        Returns:
            List of groups, where each group is a list of similar questions.
        """
        if not questions:
            return []

        texts = [self._get_embed_text(q) for q in questions]
        logger.info(f"Generating embeddings for {len(texts)} questions...")

        embeddings = self.generate_embeddings(texts)
        logger.info(f"Generated {len(embeddings)} embeddings")

        # Track which questions have been assigned to a group
        assigned = set()
        groups = []

        for i in range(len(questions)):
            if i in assigned:
                continue

            # Start a new group with this question
            group = [questions[i]]
            assigned.add(i)

            # Find all similar questions
            for j in range(i + 1, len(questions)):
                if j in assigned:
                    continue

                sim = self.cosine_similarity(embeddings[i], embeddings[j])

                if sim >= self.threshold:
                    group.append(questions[j])
                    assigned.add(j)
                    logger.debug(
                        f"Merged: [{sim:.3f}] "
                        f"'{texts[i][:50]}...' "
                        f"<-> '{texts[j][:50]}...'"
                    )

            groups.append(group)

        # Stats
        multi_groups = [g for g in groups if len(g) > 1]
        logger.info(
            f"Found {len(groups)} unique questions "
            f"({len(multi_groups)} groups with duplicates, "
            f"{len(groups) - len(multi_groups)} unique)"
        )

        return groups

    def select_canonical(self, group: List[Dict]) -> str:
        """Select the canonical (best) version of a question from a group.
        Strategy: pick the longest english_content version."""
        return max(group, key=lambda q: len(self._get_embed_text(q)))['english_content'] or \
               max(group, key=lambda q: len(q.get('content', '')))['content']

    def _aggregate_types(self, group: List[Dict]) -> List[str]:
        """Aggregate llm_types across all questions in a group (union).
        Normalizes old type names and filters to only valid canonical types."""
        all_types = set()
        for q in group:
            llm_types = q.get('llm_types')
            if llm_types:
                for t in llm_types:
                    normalized = TYPE_NORMALIZATION.get(t, t)
                    if normalized in VALID_TYPES:
                        all_types.add(normalized)
        return sorted(all_types) if all_types else []

    def process_and_merge(self, db_manager) -> Dict:
        """
        Full pipeline: fetch raw questions, compute embeddings,
        group similar ones, and update merged_questions table.

        Returns:
            Stats dict with counts
        """
        # 1. Fetch all raw questions
        logger.info("Fetching all raw questions from database...")
        raw_questions = db_manager.get_all_raw_questions()
        logger.info(f"Fetched {len(raw_questions)} raw questions")

        if not raw_questions:
            return {'total': 0, 'groups': 0, 'duplicates': 0}

        # 2. Find groups
        groups = self.find_groups(raw_questions)

        # 3. Clear old merged data and rebuild
        logger.info("Clearing old merged data...")
        db_manager.clear_merged_data()

        # 4. For each group, create merged question and mappings
        logger.info("Creating merged questions...")
        total_mappings = 0

        for group in groups:
            canonical = self.select_canonical(group)
            question_types = self._aggregate_types(group)
            # Keep first non-null single type for backward compat
            question_type = question_types[0] if question_types else None

            # english_content is the canonical (already English from select_canonical)
            english_content = canonical

            # first_seen_at = earliest published_at across all raw questions in group
            published_dates = [
                q['published_at'] for q in group
                if q.get('published_at') is not None
            ]
            first_seen_at = min(published_dates) if published_dates else None

            # Create merged question
            merged_id = db_manager.create_merged_question(
                content=canonical,
                question_type=question_type,
                question_types=question_types or None,
                english_content=english_content,
                first_seen_at=first_seen_at,
            )

            # Update frequency
            db_manager.update_merged_frequency(merged_id, len(group))

            # Create mappings for each raw question in the group
            for raw_q in group:
                db_manager.create_question_mapping(
                    raw_id=str(raw_q['id']),
                    merged_id=merged_id,
                    similarity=1.0 if len(group) == 1 else 0.9
                )
                total_mappings += 1

            # Link companies
            companies_seen = set()
            for raw_q in group:
                company = raw_q.get('company')
                if company and company not in companies_seen:
                    companies_seen.add(company)
                    company_id = db_manager.get_or_create_company(company)
                    db_manager.link_question_to_company(merged_id, company_id)

        stats = {
            'total_raw': len(raw_questions),
            'total_groups': len(groups),
            'duplicates': sum(1 for g in groups if len(g) > 1),
            'total_mappings': total_mappings,
        }

        logger.info(f"Merge complete: {stats}")
        return stats
