'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

interface RawQuestion {
  id: string
  content: string
  source: string
  source_url: string
  company: string | null
  question_type: string | null
  scraped_at: string
  published_at: string | null
  similarity_score: number
}

interface QuestionDetail {
  id: string
  content: string
  frequency: number
  question_type: string | null
  question_types: string[]
  companies: string[]
  updated_at: string
  raw_questions: RawQuestion[]
}

const SOURCE_LABELS: Record<string, string> = {
  'pm_exercises': 'PM Exercises',
  'stellarpeers': 'StellarPeers',
  'nowcoder': 'Nowcoder',
}

export default function QuestionDetailPage() {
  const params = useParams()
  const [question, setQuestion] = useState<QuestionDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (params.id) {
      fetch(`/api/questions/${params.id}`)
        .then(res => res.json())
        .then(data => {
          if (data.error) {
            setQuestion(null)
          } else {
            setQuestion(data)
          }
        })
        .catch(err => console.error('Error loading question:', err))
        .finally(() => setLoading(false))
    }
  }, [params.id])

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (!question) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-12">
          <p className="text-gray-600 text-lg">Question not found</p>
          <Link href="/questions" className="text-primary-600 hover:text-primary-700 mt-4 inline-block">
            Back to Questions
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Back Link */}
      <Link
        href="/questions"
        className="text-primary-600 hover:text-primary-700 text-sm font-medium mb-6 inline-block"
      >
        &larr; Back to Questions
      </Link>

      {/* Main Question Card */}
      <div className="bg-white border rounded-lg p-8 mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          {question.content}
        </h1>

        <div className="flex flex-wrap gap-2 mb-4">
          {/* Frequency Badge */}
          {question.frequency > 1 && (
            <span className="px-3 py-1 bg-red-100 text-red-700 text-sm font-semibold rounded-full">
              Asked {question.frequency}x
            </span>
          )}

          {/* Companies */}
          {question.companies.map(company => (
            <span key={company} className="px-3 py-1 bg-blue-100 text-blue-700 text-sm rounded-full">
              {company}
            </span>
          ))}

          {/* Types (multi-label) */}
          {(question.question_types || []).map(type => (
            <span
              key={type}
              className={`px-3 py-1 text-sm rounded-full ${
                type === 'AI Domain'
                  ? 'bg-purple-100 text-purple-700'
                  : 'bg-green-100 text-green-700'
              }`}
            >
              {type}
            </span>
          ))}
        </div>
      </div>

      {/* Sub-questions (Raw Sources) */}
      {question.raw_questions.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Sources ({question.raw_questions.length})
          </h2>

          <div className="space-y-3">
            {question.raw_questions.map((rq) => (
              <div
                key={rq.id}
                className="bg-white border rounded-lg p-5 hover:shadow transition"
              >
                <p className="text-gray-800 mb-3">{rq.content}</p>

                <div className="flex items-center justify-between text-sm">
                  <div className="flex flex-wrap gap-2">
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                      {SOURCE_LABELS[rq.source] || rq.source}
                    </span>
                    {rq.company && (
                      <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded">
                        {rq.company}
                      </span>
                    )}
                    {rq.similarity_score < 1.0 && (
                      <span className="px-2 py-0.5 bg-yellow-50 text-yellow-700 rounded">
                        {(rq.similarity_score * 100).toFixed(0)}% match
                      </span>
                    )}
                  </div>

                  <a
                    href={rq.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-600 hover:text-primary-700 font-medium"
                  >
                    View Source
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
