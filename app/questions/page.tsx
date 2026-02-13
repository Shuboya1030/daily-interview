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
}

export default function QuestionsPage() {
  const [questions, setQuestions] = useState<Question[]>([])
  const [filters, setFilters] = useState<Filters>({ companies: [], types: [] })
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)

  // Filter states
  const [selectedCompany, setSelectedCompany] = useState('')
  const [selectedType, setSelectedType] = useState('')

  // Load filters
  useEffect(() => {
    fetch('/api/filters')
      .then(res => res.json())
      .then(data => setFilters({ companies: data.companies || [], types: data.types || [] }))
      .catch(err => console.error('Error loading filters:', err))
  }, [])

  // Load questions
  useEffect(() => {
    loadQuestions()
  }, [selectedCompany, selectedType])

  const loadQuestions = async () => {
    setLoading(true)

    const params = new URLSearchParams()
    if (selectedCompany) params.append('company', selectedCompany)
    if (selectedType) params.append('type', selectedType)
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
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">PM Interview Question Bank</h1>
        <p className="text-gray-600">
          {total} questions collected from multiple sources
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white border rounded-lg p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Filter</h2>
          <button
            onClick={resetFilters}
            className="text-sm text-primary-600 hover:text-primary-700"
          >
            Reset
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Company Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Company
            </label>
            <select
              value={selectedCompany}
              onChange={(e) => setSelectedCompany(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">All Companies</option>
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
              Question Type
            </label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">All Types</option>
              {filters.types.map(type => (
                <option key={type} value={type}>
                  {type}
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
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      ) : questions.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-600 text-lg">No questions found</p>
          <p className="text-gray-500 text-sm mt-2">Try adjusting your filters</p>
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

                  {/* Tags - only company and type */}
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
                  </div>
                </div>
              </div>

              {/* Question Footer */}
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <div className="text-sm text-gray-500">
                  {new Date(question.scraped_at).toLocaleDateString('en-US')}
                </div>
                <a
                  href={question.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:text-primary-700 text-sm font-medium"
                >
                  View Source
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Load More */}
      {questions.length > 0 && questions.length < total && (
        <div className="text-center mt-8">
          <button
            onClick={loadQuestions}
            className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
          >
            Load More
          </button>
        </div>
      )}
    </div>
  )
}
