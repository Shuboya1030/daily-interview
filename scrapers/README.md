# Scrapers - Daily Interview

Python爬虫系统，负责从多个信息源爬取PM面试题。

## 🏗️ 架构

```
scrapers/
├── config.py              # 配置文件
├── requirements.txt       # Python依赖
├── main.py               # 主入口（待创建）
├── scrapers/             # 爬虫实现
│   ├── base.py          # 基础爬虫类
│   ├── pm_exercises.py  # PM Exercises爬虫
│   ├── nowcoder.py      # 牛客网爬虫
│   └── stellarpeers.py  # StellarPeers爬虫
├── processors/           # 数据处理
│   ├── normalizer.py    # 数据标准化
│   └── similarity.py    # GPT相似度检测
├── database/             # 数据库操作
│   └── db.py            # Database Manager
└── logs/                 # 日志文件
```

## 🚀 快速开始

### 1. 安装依赖

```bash
cd scrapers
pip install -r requirements.txt
```

### 2. 安装Playwright浏览器

```bash
playwright install chromium
```

### 3. 配置环境变量

在项目根目录创建 `.env` 文件：

```bash
DATABASE_URL=postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres
OPENAI_API_KEY=sk-...
```

### 4. 运行爬虫

```bash
python main.py
```

## 📊 工作流程

```
1. 爬取原始数据
   ├─ PM Exercises (2000+题)
   ├─ 牛客网
   └─ StellarPeers

2. 数据清洗和标准化
   ├─ 清理格式
   ├─ 标准化公司名
   └─ 推断题型

3. 存入raw_questions表

4. GPT相似度检测
   └─ 与existing merged_questions对比

5. 合并或创建题目
   ├─ 相似度>80% → 合并到existing
   └─ 相似度<80% → 创建新merged_question

6. 更新频率统计
```

## 🕷️ 实现的爬虫

### BaseScraper
所有爬虫的基类，提供：
- 重试逻辑
- 请求头管理
- 数据标准化
- 日志记录

### PM Exercises Scraper
- 数据量：2000+题
- 优先级：最高
- 技术：Playwright（处理JS渲染）

### Nowcoder Scraper
- 数据量：中等
- 语言：中文
- 技术：Playwright（Vue.js渲染）

### StellarPeers Scraper
- 数据量：中等
- 技术：Requests + BeautifulSoup

## 🤖 GPT相似度检测

使用GPT-4进行语义相似度检测：

**阈值：** 80%

**示例：**
- "What's your favorite product?" vs "Tell me about a product you love" → 95%
- "Design a product for drivers" vs "Design a product for commuters" → 85%

**成本优化：**
- 批量处理
- 预过滤（长度差异大的跳过）
- 缓存已处理的题目对

## 📝 数据格式

### Raw Question (爬取的原始数据)
```python
{
    'content': 'What is your favorite product?',
    'source': 'pm_exercises',
    'source_url': 'https://...',
    'company': 'Google',
    'question_type': 'Product Design',
    'metadata': {
        'answer_count': 42,
        'view_count': 1234,
        'tags': ['product-sense']
    },
    'published_at': '2024-01-15T10:00:00Z'
}
```

## 🔧 配置

编辑 `config.py`：

```python
# 爬取天数
SCRAPE_DAYS_BACK = 90  # 3个月

# 相似度阈值
SIMILARITY_THRESHOLD = 0.8  # 80%

# GPT模型
GPT_MODEL = "gpt-4-turbo-preview"
```

## 📊 监控和日志

日志保存在 `logs/scraper.log`：

```
2024-01-15 10:00:00 - Scraper.pm_exercises - INFO - Starting scraper
2024-01-15 10:05:23 - Scraper.pm_exercises - INFO - Scraped 2342 questions
2024-01-15 10:10:15 - Similarity - INFO - Comparing against 1500 existing questions
2024-01-15 10:25:30 - Similarity - INFO - Found similar question! Similarity: 0.92
```

## 🐛 调试

### 保存爬取结果到文件

```python
scraper = PMExercisesScraper()
questions = scraper.scrape()
scraper.save_to_file('debug_output.json')
```

### 查看数据库统计

```python
from database.db import DatabaseManager

stats = DatabaseManager.get_stats()
print(stats)
```

## ⚠️ 注意事项

1. **反爬限制**
   - 使用合理的请求延迟
   - 轮换User-Agent
   - 尊重robots.txt

2. **成本控制**
   - GPT API调用成本：~$0.01/对比
   - 预估每天50新题 × 20对比 = $10/天
   - 使用缓存和预过滤降低成本

3. **错误处理**
   - 所有爬虫都有重试逻辑
   - 失败不会中断整个流程
   - 错误记录在日志中

## 🔄 GitHub Actions集成

爬虫通过GitHub Actions每天自动运行，见 `.github/workflows/daily-scraper.yml`
