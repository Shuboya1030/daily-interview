# 本地运行指南

## 🎯 快速开始（10分钟）

### 前置要求
- Node.js 18+ 已安装
- Python 3.11+ 已安装
- Git 已安装

### 步骤1: 设置Supabase数据库（5分钟）

如果还没有Supabase账号：

1. 访问 https://supabase.com
2. 点击 "Start your project"
3. 用GitHub登录
4. 创建新项目：
   - 项目名称：`daily-interview`
   - 数据库密码：设置一个强密码（记住它！）
   - 区域：选择Singapore（亚洲最快）
5. 等待项目创建完成（约2分钟）

6. 执行Schema：
   - 进入项目后，点击左侧 "SQL Editor"
   - 点击 "New query"
   - 打开本地的 `database/schema.sql` 文件
   - 复制全部内容粘贴到编辑器
   - 点击 "Run"
   - 看到 "Success" 表示成功

7. 获取连接信息：
   - 点击左侧 "Settings" → "API"
   - 复制 `Project URL`
   - 复制 `anon public` key
   - 点击左侧 "Settings" → "Database"
   - 向下滚动到 "Connection string" → "URI"
   - 复制连接字符串，将 `[YOUR-PASSWORD]` 替换为你的密码

### 步骤2: 配置环境变量

在项目根目录创建 `.env.local` 文件：

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

在项目根目录创建 `.env` 文件（用于爬虫）：

```bash
DATABASE_URL=postgresql://postgres.xxxxx:[PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
```

### 步骤3: 安装依赖并测试

打开命令行，执行以下命令：

```bash
# 1. 安装前端依赖
npm install

# 2. 安装Python依赖
cd scrapers
pip install -r requirements.txt

# 3. 安装Playwright浏览器（需要一些时间）
playwright install chromium

# 4. 创建日志目录
mkdir logs

# 5. 回到项目根目录
cd ..
```

---

## 🕷️ 测试爬虫

### Option A: 测试单个爬虫（推荐先做）

```bash
cd scrapers
python test_scraper.py
```

这会测试所有3个爬虫，并生成JSON文件供检查：
- `test_output_pm_exercises.json`
- `test_output_nowcoder.json`
- `test_output_stellarpeers.json`

**预期输出：**
```
============================================================
Testing PM Exercises
============================================================

✓ Scraped 50 questions
Sample question:
  Content: What is your favorite product?...
  Company: Google
  Type: Product Design
  URL: https://...

✓ Saved results to test_output_pm_exercises.json
```

### Option B: 运行完整爬虫流程

```bash
cd scrapers
python main.py
```

这会：
1. 爬取所有3个信息源
2. 数据标准化
3. 存入Supabase数据库

**预期输出：**
```
============================================================
Daily Interview Scraper Started
Scraping last 90 days
============================================================

============================================================
Running pm_exercises scraper
============================================================
Starting scraper for pm_exercises
Scraping last 90 days
Launching browser...
Found 10 pages to scrape
Scraping page 1/10
Scraped 50 questions from page 1
...

✓ pm_exercises: Scraped 500 questions

...

============================================================
Total questions scraped: 800
============================================================

✓ Normalized 800 questions
✓ Inserted 800 new questions into database

============================================================
Database Statistics
============================================================
Total raw questions: 800
By Source:
  pm_exercises: 500
  nowcoder: 200
  stellarpeers: 100
```

---

## 🎨 测试前端

在新的命令行窗口：

```bash
# 确保在项目根目录
npm run dev
```

**预期输出：**
```
▲ Next.js 14.1.0
- Local:        http://localhost:3000
- Network:      http://192.168.x.x:3000

✓ Ready in 2.3s
```

打开浏览器访问：http://localhost:3000

你应该看到：
1. 首页：Daily Interview介绍页面
2. 点击 "开始浏览题目"
3. 题目列表页：显示所有爬取的题目
4. 可以按公司、题型、来源筛选

---

## 🔍 验证数据

### 检查Supabase数据库

1. 访问你的Supabase项目
2. 点击左侧 "Table Editor"
3. 选择 `raw_questions` 表
4. 应该看到爬取的题目数据

### 检查本地JSON文件

```bash
cd scrapers
ls -la test_output_*.json
```

用文本编辑器打开这些JSON文件，查看爬取的题目。

---

## ⚠️ 常见问题

### Q: pip install 报错
**A:** 尝试：
```bash
pip install --upgrade pip
pip install -r requirements.txt --user
```

### Q: playwright install 失败
**A:** 尝试：
```bash
playwright install --with-deps chromium
```

### Q: 数据库连接失败
**A:** 检查：
- `.env` 文件中的 DATABASE_URL 格式是否正确
- 密码是否包含特殊字符（需要URL编码）
- Supabase项目是否处于活跃状态

### Q: 爬虫没有数据
**A:** 可能原因：
- 网站结构变化（selector不匹配）
- 网络问题
- 反爬限制

先运行 `test_scraper.py` 看具体哪个爬虫有问题。

### Q: 前端显示"暂无题目"
**A:** 检查：
1. 爬虫是否成功运行
2. 数据库是否有数据
3. `.env.local` 文件配置是否正确

---

## 📊 完整流程测试

按以下顺序操作：

```bash
# 1. 测试爬虫（约5-10分钟）
cd scrapers
python test_scraper.py

# 2. 检查输出文件
ls -la test_output_*.json

# 3. 运行完整爬虫（约10-15分钟）
python main.py

# 4. 启动前端（新命令行窗口）
cd ..
npm run dev

# 5. 打开浏览器
# 访问 http://localhost:3000
# 点击 "开始浏览题目"
# 查看爬取的题目
```

---

## ✅ 成功标志

如果看到以下内容，说明一切正常：

1. **爬虫成功**：
   - 日志显示 "Scraped XXX questions"
   - JSON文件包含题目数据
   - Supabase表中有数据

2. **前端成功**：
   - localhost:3000 可以访问
   - 首页正常显示
   - 题目列表显示数据
   - 筛选器正常工作

3. **数据库成功**：
   - Supabase Table Editor 显示数据
   - 题目数量与爬虫日志一致

---

准备好了吗？我们开始吧！🚀

你想从哪一步开始？
1. 设置Supabase数据库
2. 测试爬虫
3. 测试前端
