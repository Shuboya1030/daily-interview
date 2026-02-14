'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

interface RawQuestion {
  id: string
  content: string
  english_content: string | null
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
  english_content: string | null
  frequency: number
  question_type: string | null
  question_types: string[]
  companies: string[]
  first_seen_at: string | null
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
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-accent"></div>
          <p className="mt-4 text-ink/60">Loading...</p>
        </div>
      </div>
    )
  }

  if (!question) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-12">
          <p className="text-ink/70 text-lg">Question not found</p>
          <Link href="/questions" className="text-accent hover:text-accent/80 mt-4 inline-block">
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
        className="text-accent hover:text-accent/80 text-sm font-medium mb-6 inline-block"
      >
        &larr; Back to Questions
      </Link>

      {/* Main Question Card */}
      <div className="bg-cream-dark/30 border border-cream-dark rounded-lg p-8 mb-8">
        <h1 className="text-2xl font-bold text-ink mb-4">
          {question.content}
        </h1>

        <div className="flex flex-wrap gap-2 mb-4">
          {/* Frequency Badge — highlighted */}
          {question.frequency > 1 && (
            <span className="px-3 py-1 bg-accent/15 text-accent text-sm font-semibold rounded-full">
              Asked {question.frequency}x
            </span>
          )}

          {/* Companies count — highlighted */}
          {question.companies.length > 0 && (
            <span className="px-3 py-1 bg-accent/15 text-accent text-sm font-semibold rounded-full">
              {question.companies.length} {question.companies.length === 1 ? 'company' : 'companies'}
            </span>
          )}

          {/* Company tags */}
          {question.companies.map(company => (
            <span key={company} className="px-3 py-1 bg-cream-dark text-ink/70 text-sm rounded-full">
              {company}
            </span>
          ))}

          {/* Types (multi-label) */}
          {(question.question_types || []).map(type => (
            <span
              key={type}
              className="px-3 py-1 bg-cream-dark text-ink/70 text-sm rounded-full"
            >
              {type}
            </span>
          ))}
        </div>

        {/* First seen date */}
        {question.first_seen_at && (
          <p className="text-sm text-ink/50 mt-3">
            First seen: {new Date(question.first_seen_at).toLocaleDateString('en-US', {
              year: 'numeric', month: 'short', day: 'numeric'
            })}
          </p>
        )}
      </div>

      {/* Sub-questions (Raw Sources) */}
      {question.raw_questions.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-ink mb-4">
            Sources ({question.raw_questions.length})
          </h2>

          <div className="space-y-3">
            {question.raw_questions.map((rq) => (
              <div
                key={rq.id}
                className="bg-cream-dark/30 border border-cream-dark rounded-lg p-5 hover:shadow transition"
              >
                <p className="text-ink">{rq.content}</p>
                {/* Show English translation for Nowcoder (Chinese) sources */}
                {rq.source === 'nowcoder' && rq.english_content && rq.english_content !== rq.content && (
                  <p className="text-ink/50 text-sm italic mt-1">{rq.english_content}</p>
                )}
                <div className="mt-3" />

                <div className="flex items-center justify-between text-sm">
                  <div className="flex flex-wrap gap-2">
                    <span className="px-2 py-0.5 bg-cream-dark text-ink/60 rounded">
                      {SOURCE_LABELS[rq.source] || rq.source}
                    </span>
                    {rq.company && (
                      <span className="px-2 py-0.5 bg-cream-dark text-ink/60 rounded">
                        {rq.company}
                      </span>
                    )}
                    {rq.similarity_score < 1.0 && (
                      <span className="px-2 py-0.5 bg-accent/10 text-accent rounded">
                        {(rq.similarity_score * 100).toFixed(0)}% match
                      </span>
                    )}
                  </div>

                  <a
                    href={rq.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:text-accent/80 font-medium"
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
