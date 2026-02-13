"""
简单测试脚本 - 不需要数据库
只测试爬虫是否能正常获取数据
"""
import sys
import logging
from scrapers import PMExercisesScraper

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(message)s'
)

def main():
    print("\n" + "="*60)
    print("Daily Interview - 简单爬虫测试（无需数据库）")
    print("="*60 + "\n")

    print("测试 PM Exercises 爬虫...")
    print("这将需要约2-3分钟，请耐心等待...\n")

    try:
        scraper = PMExercisesScraper()

        # 只爬取第1页数据（快速测试）
        print("开始爬取...")
        questions = scraper.scrape(days_back=7)  # 只爬最近7天

        print(f"\n✓ 成功爬取 {len(questions)} 道题目！\n")

        if questions:
            # 显示前3道题
            print("示例题目：")
            print("-" * 60)
            for i, q in enumerate(questions[:3], 1):
                print(f"\n题目 {i}:")
                print(f"  内容: {q.get('content', 'N/A')[:80]}...")
                print(f"  公司: {q.get('company', '未知')}")
                print(f"  类型: {q.get('question_type', '未分类')}")
                print(f"  来源: {q.get('source_url', 'N/A')[:50]}...")

            # 保存到文件
            import json
            filename = "test_output_simple.json"
            with open(filename, 'w', encoding='utf-8') as f:
                json.dump(questions, f, indent=2, ensure_ascii=False)

            print(f"\n✓ 所有题目已保存到: {filename}")
            print(f"可以用文本编辑器打开查看\n")

        print("="*60)
        print("✅ 测试成功！爬虫工作正常！")
        print("="*60)
        print("\n下一步: 配置Supabase数据库，然后运行完整系统\n")

    except ImportError as e:
        print(f"\n❌ 错误: 缺少依赖库")
        print(f"请先运行:")
        print(f"  cd scrapers")
        print(f"  pip install -r requirements.txt")
        print(f"  playwright install chromium\n")
        sys.exit(1)

    except Exception as e:
        print(f"\n❌ 错误: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == '__main__':
    main()
