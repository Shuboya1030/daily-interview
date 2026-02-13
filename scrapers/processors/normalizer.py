"""
Data normalization utilities
"""
from typing import Optional, Dict
import re
from config import COMPANY_TYPES


class DataNormalizer:
    """Normalize scraped data"""

    @staticmethod
    def normalize_company_name(raw_name: str) -> Optional[str]:
        """
        Normalize company names to standard format

        Examples:
            "google" -> "Google"
            "Meta (Facebook)" -> "Meta"
            "amazon.com" -> "Amazon"
        """
        if not raw_name:
            return None

        name = raw_name.strip()

        # Remove common suffixes
        name = re.sub(r'\s*\(.*?\)', '', name)  # Remove (...)
        name = re.sub(r'\s*,\s*Inc\.?.*', '', name, flags=re.IGNORECASE)  # Remove ", Inc"
        name = re.sub(r'\.com.*', '', name, flags=re.IGNORECASE)  # Remove .com

        # Capitalize
        name = name.strip().title()

        # Special cases
        special_cases = {
            'Bytedance': 'ByteDance',
            'Tiktok': 'TikTok',
            'Linkedin': 'LinkedIn',
            'Openai': 'OpenAI',
            'Chatgpt': 'ChatGPT',
        }

        for wrong, correct in special_cases.items():
            if name.lower() == wrong.lower():
                return correct

        return name

    @staticmethod
    def get_company_type(company_name: str) -> Optional[str]:
        """Determine company type (FAANG, Unicorn, Big Tech)"""
        if not company_name:
            return None

        for type_name, companies in COMPANY_TYPES.items():
            if company_name in companies:
                return type_name

        return None

    @staticmethod
    def clean_question_content(content: str) -> str:
        """Clean and normalize question content"""
        if not content:
            return ""

        # Remove extra whitespace
        content = re.sub(r'\s+', ' ', content)

        # Remove common prefixes
        content = re.sub(r'^(Question|Q):\s*', '', content, flags=re.IGNORECASE)

        # Trim
        content = content.strip()

        return content

    @staticmethod
    def extract_question_type_from_content(content: str) -> Optional[str]:
        """Try to infer question type from content"""
        content_lower = content.lower()

        # Pattern matching
        if any(word in content_lower for word in ['design', 'build', 'create', 'improve']):
            return 'Product Design'

        if any(word in content_lower for word in ['metric', 'measure', 'kpi', 'track']):
            return 'Metrics'

        if any(word in content_lower for word in ['tell me about', 'describe a time', 'give an example']):
            return 'Behavioral'

        if any(word in content_lower for word in ['estimate', 'how many', 'calculate']):
            return 'Estimation'

        if any(word in content_lower for word in ['strategy', 'market', 'compete', 'growth']):
            return 'Product Strategy'

        return None
