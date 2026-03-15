"""
AI Pulse — YouTube scraper configuration
"""
import os
from dotenv import load_dotenv

load_dotenv()
load_dotenv('../.env.local')

DATABASE_URL = os.getenv('DATABASE_URL')
YOUTUBE_API_KEY = os.getenv('YOUTUBE_API_KEY')
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY', '')

# Starter channels — curated high-quality AI content for PM interviews
STARTER_CHANNELS = [
    {'handle': '@PeterYangYT',    'name': 'Peter Yang'},
    {'handle': '@JeffSu',         'name': 'Jeff Su'},
    {'handle': '@ProductManagementExercises', 'name': 'Product Management Exercises'},
    {'handle': '@LennysPodcast',  'name': "Lenny's Podcast"},
    {'handle': '@a16z',           'name': 'a16z'},
    {'handle': '@aiexplained-official', 'name': 'AI Explained'},
    {'handle': '@TwoMinutePapers', 'name': 'Two Minute Papers'},
]

# Channels to never crawl
BLOCKED_CHANNELS = [
    'Nate Herk',
]

# YouTube search queries to discover top AI videos beyond starter channels
SEARCH_QUERIES = [
    'AI product management',
    'LLM product strategy',
    'AI product manager interview',
    'building AI products',
    'RAG vs fine-tuning explained',
]

# How many videos to fetch per channel
VIDEOS_PER_CHANNEL = 30

# How many top search results to fetch per query
SEARCH_RESULTS_PER_QUERY = 10

# Only consider videos published within this many days
MAX_AGE_DAYS = 180
