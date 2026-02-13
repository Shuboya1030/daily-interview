'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Question {
  id: string
  content: string
  company: string | null
  question_type: string | null
  source: string
  source_url: string
  scraped_at: string
  metadata: any
}

interface Filters {
  companies: string[]
  types: string[]
  sources: string[]
}

export default function QuestionsPage() {
  const [questions, setQuestions] = useState<Question[]>([])
  const [filters, setFilters] = useState<Filters>({ companies: [], types: [], sources: [] })
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)

  // Filter states
  const [selectedCompany, setSelectedCompany] = useState('')
  const [selectedType, setSelectedType] = useState('')
  const [selectedSource, setSelectedSource] = useState('')

  // Load filters
  useEffect(() => {
    fetch('/api/filters')
      .then(res => res.json())
      .then(data => setFilters(data))
      .catch(err => console.error('Error loading filters:', err))
  }, [])

  // Load questions
  useEffect(() => {
    loadQuestions()
  }, [selectedCompany, selectedType, selectedSource])

  const loadQuestions = async () => {
    setLoading(true)

    const params = new URLSearchParams()
    if (selectedCompany) params.append('company', selectedCompany)
    if (selectedType) params.append('type', selectedType)
    if (selectedSource) params.append('source', selectedSource)
    params.append('limit', '100')

    try {
      const res = await fetch(`/api/questions?${params}`)
      const data = await res.json()

      setQuestions(data.questions || [])
      setTotal(data.total || 0)
    } catch (err) {
      console.error('Error loading questions:', err)
    } finally {
      setLoading(false)
    }
  }

  const resetFilters = () => {
    setSelectedCompany('')
    setSelectedType('')
    setSelectedSource('')
  }

  const getSourceLabel = (source: string) => {
    const labels: { [key: string]: string } = {
      'pm_exercises': 'PM Exercises',
      'nowcoder': '牛客网',
      'stellarpeers': 'StellarPeers'
    }
    return labels[source] || source
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">产品经理面试题库</h1>
        <p className="text-gray-600">
          共收录 <span className="font-semibold text-primary-600">{total}</span> 道题目
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white border rounded-lg p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">筛选</h2>
          <button
            onClick={resetFilters}
            className="text-sm text-primary-600 hover:text-primary-700"
          >
            重置
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Company Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              公司
            </label>
            <select
              value={selectedCompany}
              onChange={(e) => setSelectedCompany(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">全部公司</option>
              {filters.companies.map(company => (
                <option key={company} value={company}>
                  {company}
                </option>
              ))}
            </select>
          </div>

          {/* Type Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              题型
            </label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">全部题型</option>
              {filters.types.map(type => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          {/* Source Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              来源
            </label>
            <select
              value={selectedSource}
              onChange={(e) => setSelectedSource(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">全部来源</option>
              {filters.sources.map(source => (
                <option key={source} value={source}>
                  {getSourceLabel(source)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Questions List */}
      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          <p className="mt-4 text-gray-600">加载中...</p>
        </div>
      ) : questions.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-600 text-lg">暂无题目</p>
          <p className="text-gray-500 text-sm mt-2">请运行爬虫获取数据</p>
        </div>
      ) : (
        <div className="space-y-4">
          {questions.map((question) => (
            <div
              key={question.id}
              className="bg-white border rounded-lg p-6 hover:shadow-lg transition"
            >
              {/* Question Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    {question.content}
                  </h3>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-2">
                    {question.company && (
                      <span className="px-3 py-1 bg-blue-100 text-blue-700 text-sm rounded-full">
                        {question.company}
                      </span>
                    )}
                    {question.question_type && (
                      <span className="px-3 py-1 bg-green-100 text-green-700 text-sm rounded-full">
                        {question.question_type}
                      </span>
                    )}
                    <span className="px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded-full">
                      {getSourceLabel(question.source)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Question Footer */}
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <div className="text-sm text-gray-500">
                  {new Date(question.scraped_at).toLocaleDateString('zh-CN')}
                </div>
                <a
                  href={question.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:text-primary-700 text-sm font-medium"
                >
                  查看原文 →
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Load More (future enhancement) */}
      {questions.length > 0 && questions.length < total && (
        <div className="text-center mt-8">
          <button
            onClick={loadQuestions}
            className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
          >
            加载更多
          </button>
        </div>
      )}
    </div>
  )
}
