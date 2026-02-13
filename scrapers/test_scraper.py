"""
Test script for individual scrapers
Run this before the full pipeline to test each scraper
"""
import sys
import logging

from scrapers import PMExercisesScraper, NowcoderScraper, StellarPeersScraper

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)


def test_scraper(scraper_class, name: str, limit_pages: bool = True):
    """Test a single scraper"""
    print(f"\n{'='*60}")
    print(f"Testing {name}")
    print(f"{'='*60}\n")

    try:
        scraper = scraper_class()

        # For testing, only scrape recent data
        questions = scraper.scrape(days_back=7)

        print(f"\n✓ Scraped {len(questions)} questions")

        if questions:
            print(f"\nSample question:")
            print(f"  Content: {questions[0].get('content', 'N/A')[:100]}...")
            print(f"  Company: {questions[0].get('company', 'N/A')}")
            print(f"  Type: {questions[0].get('question_type', 'N/A')}")
            print(f"  URL: {questions[0].get('source_url', 'N/A')}")

        # Save to file for inspection
        filename = f"test_output_{name.lower().replace(' ', '_')}.json"
        scraper.save_to_file(filename)
        print(f"\n✓ Saved results to {filename}")

        return True

    except Exception as e:
        print(f"\n✗ Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


def main():
    """Test all scrapers"""
    print("\n" + "="*60)
    print("Daily Interview - Scraper Test Suite")
    print("="*60)

    results = {}

    # Test PM Exercises
    results['PM Exercises'] = test_scraper(PMExercisesScraper, 'PM Exercises')

    # Test Nowcoder
    results['Nowcoder'] = test_scraper(NowcoderScraper, 'Nowcoder')

    # Test StellarPeers
    results['StellarPeers'] = test_scraper(StellarPeersScraper, 'StellarPeers')

    # Summary
    print(f"\n{'='*60}")
    print("Test Summary")
    print(f"{'='*60}")

    for name, success in results.items():
        status = "✓ PASS" if success else "✗ FAIL"
        print(f"{status} - {name}")

    print(f"{'='*60}\n")

    # Exit code
    all_passed = all(results.values())
    sys.exit(0 if all_passed else 1)


if __name__ == '__main__':
    main()
