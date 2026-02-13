"""
Configuration for Daily Interview Scrapers
"""
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Database Configuration
DATABASE_URL = os.getenv('DATABASE_URL')
if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable is required")

# OpenAI Configuration (Phase 2)
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY', '')

# Scraping Configuration
SCRAPE_TIMEOUT = 30  # seconds
MAX_RETRIES = 3
RETRY_DELAY = 2  # seconds
USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

# Date Range
SCRAPE_DAYS_BACK = 90  # 3 months

# GPT Configuration
GPT_MODEL = "gpt-4-turbo-preview"
SIMILARITY_THRESHOLD = 0.8  # 80%
GPT_TEMPERATURE = 0.0  # Deterministic
GPT_MAX_TOKENS = 500

# Sources
SOURCES = {
    'pm_exercises': {
        'name': 'Product Management Exercises',
        'url': 'https://www.productmanagementexercises.com/interview-questions',
        'enabled': True,
        'priority': 'critical'
    },
    'nowcoder': {
        'name': '牛客网',
        'url': 'https://www.nowcoder.com/interview/center?jobId=11229',
        'enabled': False,  # Phase 2: requires login
        'priority': 'high'
    },
    'stellarpeers': {
        'name': 'StellarPeers',
        'url': 'https://stellarpeers.com/interview-questions/',
        'enabled': False,  # Phase 2: needs optimization
        'priority': 'medium'
    }
}

# Question Types Mapping
QUESTION_TYPES = [
    'Behavioral',
    'Product Design',
    'Product Strategy',
    'Metrics',
    'Technical',
    'Estimation',
    'Execution',
    'AI-related'
]

# Company Type Mapping
COMPANY_TYPES = {
    'FAANG': ['Google', 'Meta', 'Amazon', 'Apple', 'Microsoft', 'Netflix'],
    'Unicorn': ['Stripe', 'OpenAI', 'Anthropic', 'Databricks', 'Airbnb', 'Uber'],
    'Big Tech': ['LinkedIn', 'Salesforce', 'Oracle', 'Adobe']
}

# Logging
LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')
LOG_FILE = 'logs/scraper.log'
