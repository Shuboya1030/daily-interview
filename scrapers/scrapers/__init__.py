"""
Scrapers module
"""
from scrapers.pm_exercises import PMExercisesScraper
from scrapers.nowcoder import NowcoderScraper
from scrapers.stellarpeers import StellarPeersScraper

__all__ = [
    'PMExercisesScraper',
    'NowcoderScraper',
    'StellarPeersScraper',
]
