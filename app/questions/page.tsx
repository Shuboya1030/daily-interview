'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Sparkles, Send } from 'lucide-react'

interface Question {
  id: string
  content: string
  english_content: string | null
  frequency: number
  company: string | null
  companies: string[]
  question_type: string | null
  question_types: string[]
  first_seen_at: string | null
  updated_at: string
}

interface Filters {
  companies: string[]
  types: string[]
}

const SUGGESTION_CHIPS = [
  'What is the responsibility of a Data PM?',
  'How would you design an AI-powered chatbot?',
  'Explain RAG to a non-technical stakeholder',
  'What metrics would you track for an LLM product?',
]

export default function QuestionsPage() {
  const router = useRouter()
  const [questions, setQuestions] = useState<Question[]>([])
  const [filters, setFilters] = useState<Filters>({ companies: [], types: [] })
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)

  // Filter states
  const [selectedCompany, setSelectedCompany] = useState('')
  const [selectedType, setSelectedType] = useState('AI Domain Knowledge')

  // Ask question states
  const [askInput, setAskInput] = useState('')
  const [asking, setAsking] = useState(false)
  const [streamedText, setStreamedText] = useState('')
  const [askError, setAskError] = useState<string | null>(null)
  const streamCardRef = useRef<HTMLDivElement>(null)

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

  const handleAsk = async (questionText?: string) => {
    const text = (questionText || askInput).trim()
    if (!text || asking) return

    setAsking(true)
    setStreamedText('')
    setAskError(null)

    // Scroll to streaming card after it renders
    setTimeout(() => {
      streamCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)

    try {
      const res = await fetch('/api/questions/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text }),
      })

      const contentType = res.headers.get('content-type') || ''

      if (contentType.includes('application/json')) {
        const data = await res.json()
        if (data.error) {
          setAskError(data.error)
          setAsking(false)
          return
        }
      }

      // Handle streaming response
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const payload = JSON.parse(line.slice(6))
              if (payload.token) {
                setStreamedText(prev => prev + payload.token)
              }
              if (payload.done && payload.questionId) {
                // Navigate to the new question's detail page
                router.push(`/questions/${payload.questionId}`)
                return
              }
              if (payload.error) {
                setAskError(payload.error)
              }
            } catch {
              // skip malformed JSON
            }
          }
        }
      }
    } catch (err) {
      console.error('Ask failed:', err)
      setAskError('Failed to connect to the server')
    } finally {
      setAsking(false)
    }
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header + Stats */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2 text-ink">PM Interview Question Bank</h1>
        <p className="text-ink/60 mb-5">
          {total} questions collected from multiple sources, sorted by frequency
        </p>
        <div className="flex gap-6">
          {[
            { num: '120+', label: 'Questions' },
            { num: '15+', label: 'Companies' },
            { num: '40+', label: 'Expert Video Sources' },
          ].map(s => (
            <div key={s.label} className="flex items-baseline gap-1.5">
              <span className="text-xl font-bold text-ink">{s.num}</span>
              <span className="text-xs text-ink/40">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Ask Any Question */}
      <div className="bg-accent/5 border border-accent/20 rounded-lg p-6 mb-8">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={18} className="text-accent" />
          <h2 className="text-lg font-semibold text-ink">Ask any AI PM interview question</h2>
        </div>

        <div className="flex gap-3">
          <input
            type="text"
            value={askInput}
            onChange={(e) => setAskInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAsk() }}
            placeholder="e.g. What is the responsibility of a Data PM?"
            disabled={asking}
            className="flex-1 px-4 py-2.5 border border-cream-dark rounded-lg bg-cream focus:outline-none focus:ring-2 focus:ring-accent/40 text-ink placeholder:text-ink/40 disabled:opacity-50"
          />
          <button
            onClick={() => handleAsk()}
            disabled={asking || !askInput.trim()}
            className="px-5 py-2.5 bg-accent text-white rounded-lg font-medium hover:opacity-90 transition disabled:opacity-50 inline-flex items-center gap-2"
          >
            <Send size={16} />
            Ask
          </button>
        </div>

        {/* Suggestion chips */}
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="text-xs text-ink/40 self-center mr-1">Try:</span>
          {SUGGESTION_CHIPS.map(chip => (
            <button
              key={chip}
              onClick={() => { setAskInput(chip); handleAsk(chip) }}
              disabled={asking}
              className="px-3 py-1.5 text-sm bg-cream border border-cream-dark rounded-full text-ink/70 hover:bg-cream-dark/50 hover:text-ink transition disabled:opacity-50"
            >
              {chip}
            </button>
          ))}
        </div>
      </div>

      {/* Streaming Answer Card */}
      {(asking || streamedText) && (
        <div ref={streamCardRef} className="bg-cream-dark/30 border border-cream-dark rounded-lg p-6 mb-8">
          {asking && !streamedText && (
            <div className="space-y-3 animate-pulse">
              <div className="h-4 bg-cream-dark rounded w-3/4"></div>
              <div className="h-4 bg-cream-dark rounded w-full"></div>
              <div className="h-4 bg-cream-dark rounded w-5/6"></div>
              <div className="h-4 bg-cream-dark rounded w-2/3"></div>
            </div>
          )}
          {streamedText && (
            <div className="prose prose-sm max-w-none text-ink/85 whitespace-pre-line leading-relaxed">
              {streamedText}
              {asking && <span className="inline-block w-1.5 h-4 bg-accent/60 animate-pulse ml-0.5 align-middle" />}
            </div>
          )}
          <div className="mt-4 pt-3 border-t border-cream-dark flex items-center text-xs text-ink/40">
            <Sparkles size={12} className="mr-1.5 text-accent/50" />
            <span>{asking ? 'Generating expert inspirations...' : 'Redirecting to full answer...'}</span>
          </div>
        </div>
      )}

      {/* Ask Error */}
      {askError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-8 text-red-700 text-sm">
          {askError}
        </div>
      )}

      {/* Filters */}
      <div className="bg-cream-dark/50 border border-cream-dark rounded-lg p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-ink">Filter</h2>
          <button
            onClick={resetFilters}
            className="text-sm text-accent hover:text-accent/80"
          >
            Reset
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Company Filter */}
          <div>
            <label className="block text-sm font-medium text-ink/70 mb-2">
              Company
            </label>
            <select
              value={selectedCompany}
              onChange={(e) => setSelectedCompany(e.target.value)}
              className="w-full px-3 py-2 border border-cream-dark rounded-lg bg-cream focus:outline-none focus:ring-2 focus:ring-accent/40"
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
            <label className="block text-sm font-medium text-ink/70 mb-2">
              Question Type
            </label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full px-3 py-2 border border-cream-dark rounded-lg bg-cream focus:outline-none focus:ring-2 focus:ring-accent/40"
            >
              <option value="">All Types</option>
              {filters.types.map(type => (
                <option key={type} value={type}>
                  {type}{type === 'AI Domain Knowledge' ? ' — Expert Inspirations available' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Questions List */}
      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-accent"></div>
          <p className="mt-4 text-ink/60">Loading...</p>
        </div>
      ) : questions.length === 0 ? (
        <div className="text-center py-12 bg-cream-dark/30 rounded-lg">
          <p className="text-ink/70 text-lg">No questions found</p>
          <p className="text-ink/50 text-sm mt-2">Try adjusting your filters</p>
        </div>
      ) : (
        <div className="space-y-4">
          {questions.map((question) => {
            const isAI = (question.question_types || []).includes('AI Domain Knowledge')
            return (
              <Link
                key={question.id}
                href={`/questions/${question.id}`}
                className="block"
              >
                <div className="bg-cream-dark/30 border border-cream-dark rounded-lg p-6 hover:shadow-lg transition cursor-pointer">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="text-lg font-medium text-ink mb-2">
                        {question.content}
                      </h3>

                      {/* Stats line — highlighted */}
                      {(question.frequency > 1 || (question.companies && question.companies.length > 0)) && (
                        <p className="text-sm font-semibold text-accent mb-2">
                          {[
                            question.frequency > 1 && `Asked ${question.frequency}x`,
                            question.companies && question.companies.length > 0 && `${question.companies.length} ${question.companies.length === 1 ? 'company' : 'companies'}`,
                          ].filter(Boolean).join(' · ')}
                        </p>
                      )}

                      {/* Tags */}
                      <div className="flex flex-wrap gap-2">
                        {/* Expert Insights badge for AI questions */}
                        {isAI && (
                          <span className="px-3 py-1 bg-accent/10 text-accent text-sm rounded-full inline-flex items-center gap-1 font-medium">
                            <Sparkles size={12} />
                            Expert Insights
                          </span>
                        )}

                        {/* Company tags */}
                        {question.companies && question.companies.map(company => (
                          <span key={company} className="px-3 py-1 bg-cream-dark text-ink/70 text-sm rounded-full">
                            {company}
                          </span>
                        ))}

                        {/* Type tags (multi-label) */}
                        {(question.question_types || []).map(type => (
                          <span
                            key={type}
                            className="px-3 py-1 bg-cream-dark text-ink/70 text-sm rounded-full"
                          >
                            {type}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {/* Load More */}
      {questions.length > 0 && questions.length < total && (
        <div className="text-center mt-8">
          <button
            onClick={loadQuestions}
            className="px-6 py-3 bg-accent text-white rounded-lg hover:opacity-90 transition"
          >
            Load More
          </button>
        </div>
      )}
    </div>
  )
}
