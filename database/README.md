# Database Setup Guide

## 🗄️ Schema Overview

Daily Interview使用PostgreSQL数据库，托管在Supabase上。

### 核心表结构

1. **companies** - 公司信息
2. **raw_questions** - 爬取的原始题目
3. **merged_questions** - AI合并后的高频题
4. **question_mappings** - 原始题目与合并题目的映射关系
5. **question_companies** - 题目与公司的多对多关系

### 视图

- **v_questions_full** - 完整的题目视图（包含所有关联数据）

## 🚀 快速开始

### 1. 创建Supabase项目

1. 访问 [supabase.com](https://supabase.com)
2. 创建新项目
3. 记录以下信息：
   - Project URL
   - `anon` key (公开访问)
   - `service_role` key (爬虫使用，保密！)

### 2. 执行Schema

在Supabase Dashboard中：

1. 进入 **SQL Editor**
2. 创建新query
3. 复制粘贴 `schema.sql` 的内容
4. 点击 **Run** 执行

### 3. 验证Schema

执行以下查询验证表已创建：

\`\`\`sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public';
\`\`\`

应该看到：
- companies
- raw_questions
- merged_questions
- question_mappings
- question_companies

### 4. 配置环境变量

在项目根目录创建 \`.env.local\`：

\`\`\`bash
# Supabase (前端使用)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Service Role (爬虫使用，不要暴露给前端！)
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# 直接连接PostgreSQL (爬虫使用)
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres
\`\`\`

## 📊 数据流

```
爬虫 (Python)
  ↓
raw_questions 表 (插入原始题目)
  ↓
GPT相似度检测
  ↓
merged_questions 表 (创建/更新合并题目)
  ↓
question_mappings 表 (记录映射关系)
  ↓
Next.js API
  ↓
前端展示
```

## 🔍 常用查询

### 获取所有高频题（按频率排序）

\`\`\`sql
SELECT * FROM v_questions_full
ORDER BY frequency DESC
LIMIT 50;
\`\`\`

### 获取特定公司的题目

\`\`\`sql
SELECT DISTINCT mq.*
FROM merged_questions mq
JOIN question_companies qc ON mq.id = qc.merged_question_id
JOIN companies c ON qc.company_id = c.id
WHERE c.name = 'Google'
ORDER BY mq.frequency DESC;
\`\`\`

### 统计信息

\`\`\`sql
-- 总题目数
SELECT COUNT(*) FROM merged_questions;

-- 各公司题目数
SELECT c.name, COUNT(qc.merged_question_id) as question_count
FROM companies c
LEFT JOIN question_companies qc ON c.id = qc.company_id
GROUP BY c.name
ORDER BY question_count DESC;

-- 各题型分布
SELECT question_type, COUNT(*) as count
FROM merged_questions
GROUP BY question_type
ORDER BY count DESC;
\`\`\`

## 🔒 安全性

### Row Level Security (RLS)

Schema已启用RLS：
- ✅ 公开表允许所有人 **读取**
- ❌ 只有service role可以 **写入**

爬虫使用 `service_role` key，可以绕过RLS执行写操作。

**重要：** 永远不要在前端代码中暴露 `service_role` key！

## 🔧 维护

### 重新计算频率

如果频率统计不准确：

\`\`\`sql
UPDATE merged_questions mq
SET frequency = (
  SELECT COUNT(*)
  FROM question_mappings qm
  WHERE qm.merged_question_id = mq.id
);
\`\`\`

### 清理孤儿数据

\`\`\`sql
-- 删除没有映射的merged_questions
DELETE FROM merged_questions
WHERE id NOT IN (
  SELECT DISTINCT merged_question_id FROM question_mappings
);
\`\`\`

## 📈 扩展性

当前Schema设计支持：
- ✅ 数百万条题目
- ✅ 复杂的多维度查询
- ✅ 全文搜索
- ✅ 实时更新

如需优化性能：
1. 添加更多索引（根据实际查询pattern）
2. 使用materialized views缓存复杂查询
3. 启用PostgreSQL的分区表（当数据量>1000万时）
