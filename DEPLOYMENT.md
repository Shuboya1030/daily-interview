# 部署指南 - Daily Interview

## 🚀 快速部署（3步骤）

### 步骤1: 设置Supabase数据库

1. **创建Supabase项目**
   - 访问 [supabase.com](https://supabase.com)
   - 点击 "New Project"
   - 填写项目名称、数据库密码
   - 选择区域（推荐Singapore for Asia）

2. **执行数据库Schema**
   - 进入项目的 **SQL Editor**
   - 创建新Query
   - 复制 `database/schema.sql` 的内容
   - 点击 **Run** 执行

3. **获取连接信息**
   - 进入 **Settings → API**
   - 复制以下信息：
     - `Project URL`
     - `anon/public key`
     - `service_role key` (保密！)
   - 进入 **Settings → Database**
   - 复制 `Connection string` (用于爬虫)

### 步骤2: 部署前端到Vercel

1. **推送代码到GitHub**
   ```bash
   cd pm-interview-tracker
   git init
   git add .
   git commit -m "Initial commit - Daily Interview"
   git branch -M main
   git remote add origin <your-github-repo-url>
   git push -u origin main
   ```

2. **连接Vercel**
   - 访问 [vercel.com](https://vercel.com)
   - 点击 "Import Project"
   - 选择你的GitHub仓库
   - 点击 "Import"

3. **配置环境变量**
   在Vercel的项目设置中添加：
   ```
   NEXT_PUBLIC_SUPABASE_URL=<your-project-url>
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
   ```

4. **部署**
   - 点击 "Deploy"
   - 等待构建完成（约2分钟）
   - 获得网站URL：`https://your-project.vercel.app`

### 步骤3: 配置GitHub Actions爬虫

1. **添加GitHub Secrets**
   - 进入你的GitHub仓库
   - **Settings → Secrets and variables → Actions**
   - 添加以下secrets：
     ```
     DATABASE_URL: <supabase-connection-string>
     OPENAI_API_KEY: <your-openai-key>
     ```

2. **创建workflow文件**
   文件已创建：`.github/workflows/daily-scraper.yml`

3. **测试运行**
   - 进入 **Actions** tab
   - 选择 "Daily Scraper"
   - 点击 "Run workflow"
   - 手动触发测试

4. **自动定时运行**
   - 配置好后，爬虫会每天UTC 2:00自动运行
   - 查看运行日志：**Actions** tab

---

## 📋 详细步骤说明

### 本地开发测试

#### 前端测试

```bash
# 1. 安装依赖
npm install

# 2. 创建 .env.local 文件
cp .env.example .env.local

# 3. 填写Supabase信息到 .env.local

# 4. 运行开发服务器
npm run dev

# 5. 访问 http://localhost:3000
```

#### 爬虫测试

```bash
# 1. 进入scrapers目录
cd scrapers

# 2. 安装Python依赖
pip install -r requirements.txt

# 3. 安装Playwright浏览器
playwright install chromium

# 4. 创建 .env 文件（在项目根目录）
DATABASE_URL=<supabase-connection-string>
OPENAI_API_KEY=<your-key>  # 暂时可以先不填（MVP不需要）

# 5. 测试单个爬虫
python test_scraper.py

# 6. 运行完整爬虫
python main.py
```

### 验证部署

1. **检查数据库**
   - 登录Supabase Dashboard
   - 进入 **Table Editor**
   - 查看 `raw_questions` 表是否有数据

2. **检查前端**
   - 访问 `https://your-project.vercel.app`
   - 点击 "开始浏览题目"
   - 查看是否显示题目

3. **检查爬虫**
   - 进入GitHub Actions tab
   - 查看最近一次运行的日志
   - 确认爬取成功

---

## 🔧 环境变量完整列表

### 前端 (Vercel)
```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
```

### 爬虫 (GitHub Actions Secrets)
```bash
# Supabase
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres

# OpenAI (MVP可选，后续需要)
OPENAI_API_KEY=sk-...
```

---

## 📊 GitHub Actions Workflow

已创建的workflow文件：`.github/workflows/daily-scraper.yml`

**触发方式：**
- 每天UTC 2:00自动运行
- 手动触发（Actions tab → Run workflow）

**运行内容：**
1. 安装Python和依赖
2. 安装Playwright浏览器
3. 运行爬虫脚本
4. 将数据存入Supabase

**查看日志：**
- GitHub仓库 → Actions tab
- 点击最近一次运行
- 展开步骤查看详细日志

---

## ⚠️ 常见问题

### Q1: Supabase连接失败
**A:** 检查以下内容：
- DATABASE_URL格式是否正确
- 密码中的特殊字符是否已URL编码
- Supabase项目是否已paused（免费tier会自动pause）

### Q2: Vercel部署失败
**A:** 常见原因：
- Node.js版本不兼容（确保>=18）
- 环境变量未设置
- Build命令错误

检查Vercel构建日志获取详细错误。

### Q3: 爬虫没有数据
**A:** 检查：
- GitHub Actions运行日志
- 网站结构是否变化（需要更新selector）
- 是否被反爬（增加延迟）

### Q4: OpenAI API报错
**A:** MVP版本暂时不需要OpenAI，相似度检测功能在后续版本实现。

---

## 🎯 部署后的下一步

1. **验证数据**
   - 运行一次爬虫
   - 检查数据库是否有数据
   - 访问网站查看题目

2. **监控运行**
   - 定期检查GitHub Actions日志
   - 确认爬虫每天正常运行

3. **优化调整**
   - 根据实际爬取情况调整selector
   - 优化筛选器和UI

4. **添加功能**（后续）
   - GPT相似度检测
   - 频率排序
   - 更多筛选维度

---

## 💰 成本估算

### Vercel
- **Hobby计划**: $0/月
  - 100GB带宽
  - 无限API请求
  - 足够MVP使用

### Supabase
- **Free tier**: $0/月
  - 500MB数据库
  - 2GB文件存储
  - 足够存储数万条题目

### GitHub Actions
- **Free tier**: $0/月
  - 2000分钟/月
  - 爬虫每次约5-10分钟
  - 每天运行一次 = 300分钟/月

### OpenAI API (后续)
- GPT-4使用成本
- 预估$15-30/月（实现相似度检测后）

**MVP总成本: $0/月** ✅

---

## ✅ 部署检查清单

- [ ] Supabase项目创建
- [ ] 数据库Schema执行成功
- [ ] Vercel项目部署成功
- [ ] 环境变量配置正确
- [ ] 网站可以访问
- [ ] GitHub Actions secrets配置
- [ ] 爬虫手动运行测试成功
- [ ] 数据库有题目数据
- [ ] 前端可以显示题目

完成所有步骤后，你的Daily Interview就正式上线了！🎉
