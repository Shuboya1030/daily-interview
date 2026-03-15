'use client'

import { useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { Sparkles, FileText, ArrowRight, ChevronDown, ChevronUp, Quote } from 'lucide-react'

interface MatchedQuestion {
  id: string
  content: string
  frequency: number
  question_types: string[]
}

interface ParsedQuestion {
  title: string
  why: string
  level: string
}

interface QuoteData {
  text: string
  video_title: string
  channel: string
  video_url: string
}

interface InsightData {
  text: string
  quotes: QuoteData[]
  loading: boolean
  error: string | null
}

function parsePredictions(text: string): ParsedQuestion[] {
  const questions: ParsedQuestion[] = []
  const blocks = text.split(/###\s+/).filter(Boolean)

  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length === 0) continue

    const title = lines[0].replace(/^Q\d+:\s*/, '').trim()
    if (!title) continue

    let why = ''
    let level = ''
    for (const line of lines.slice(1)) {
      if (line.startsWith('**Why:**') || line.startsWith('**Why:')) {
        why = line.replace(/\*\*Why:\*\*\s*/, '').replace(/\*\*/g, '').trim()
      }
      if (line.startsWith('**Level:**') || line.startsWith('**Level:')) {
        level = line.replace(/\*\*Level:\*\*\s*/, '').replace(/\*\*/g, '').trim()
      }
    }

    questions.push({ title, why, level })
  }

  return questions
}

function QuestionCard({
  q,
  index,
  insight,
  onGetInsights,
}: {
  q: ParsedQuestion
  index: number
  insight: InsightData | undefined
  onGetInsights: () => void
}) {
  const [expanded, setExpanded] = useState(false)

  const levelColor =
    q.level.includes('Advanced') ? 'bg-red-100 text-red-700' :
    q.level.includes('Intermediate') ? 'bg-yellow-100 text-yellow-700' :
    'bg-green-100 text-green-700'

  const hasInsight = insight && (insight.text || insight.loading)

  return (
    <div className="bg-cream-dark/30 border border-cream-dark rounded-lg overflow-hidden">
      <div className="p-5">
        <div className="flex items-start gap-3">
          <span className="text-accent font-bold text-lg mt-0.5">Q{index + 1}</span>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-ink leading-snug">
              {q.title}
            </h3>
            {q.why && (
              <p className="text-sm text-ink/55 mt-1">{q.why}</p>
            )}
            <div className="flex items-center gap-2 mt-2">
              {q.level && (
                <span className={`inline-block px-2 py-0.5 text-xs rounded ${levelColor}`}>
                  {q.level}
                </span>
              )}
              {!hasInsight && (
                <button
                  onClick={onGetInsights}
                  className="px-3 py-1 text-xs font-medium text-accent border border-accent/30 rounded hover:bg-accent/10 transition inline-flex items-center gap-1"
                >
                  <Sparkles size={12} />
                  Get Expert Insights
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Insight section */}
      {hasInsight && (
        <div className="border-t border-cream-dark bg-cream-dark/10 p-5">
          <p className="text-xs font-medium text-ink/50 mb-2 flex items-center gap-1">
            <Sparkles size={11} className="text-accent/50" />
            Expert Insights
          </p>
          <div className="text-sm text-ink/80 whitespace-pre-line leading-relaxed">
            {insight!.text}
            {insight!.loading && (
              <span className="inline-block w-1.5 h-4 bg-accent/60 animate-pulse ml-0.5 align-middle" />
            )}
          </div>

          {insight!.error && (
            <p className="text-red-500 text-xs mt-2">{insight!.error}</p>
          )}

          {/* Quotes */}
          {insight!.quotes.length > 0 && (
            <div className="mt-4">
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-xs text-accent hover:text-accent/80 flex items-center gap-1 mb-2"
              >
                <Quote size={11} />
                Key Takeaways ({insight!.quotes.length})
                {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
              {expanded && (
                <div className="space-y-2">
                  {insight!.quotes.map((qt, i) => (
                    <div key={i} className="border-l-2 border-accent/30 pl-3 py-1">
                      <p className="text-xs text-ink/70 italic">&ldquo;{qt.text}&rdquo;</p>
                      <a
                        href={qt.video_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-accent/70 hover:text-accent hover:underline"
                      >
                        {qt.channel}
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function JDAnalyzerPage() {
  const [jd, setJd] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [streamedText, setStreamedText] = useState('')
  const [matchedQuestions, setMatchedQuestions] = useState<MatchedQuestion[]>([])
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [insights, setInsights] = useState<Record<number, InsightData>>({})
  const fullTextRef = useRef('')

  const analyze = useCallback(async () => {
    if (!jd.trim() || jd.trim().length < 50) {
      setError('Please paste a job description (at least 50 characters).')
      return
    }

    setAnalyzing(true)
    setStreamedText('')
    fullTextRef.current = ''
    setMatchedQuestions([])
    setError(null)
    setDone(false)
    setInsights({})

    try {
      const res = await fetch('/api/jd/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jd: jd.trim() }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Something went wrong')
        setAnalyzing(false)
        return
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done: streamDone, value } = await reader.read()
        if (streamDone) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const payload = JSON.parse(line.slice(6))
              if (payload.matched_questions) {
                setMatchedQuestions(payload.matched_questions)
              }
              if (payload.token) {
                fullTextRef.current += payload.token
                setStreamedText(fullTextRef.current)
              }
              if (payload.done) {
                setDone(true)
              }
              if (payload.error) {
                setError(payload.error)
              }
            } catch {
              // skip
            }
          }
        }
      }
    } catch {
      setError('Failed to connect to the server')
    } finally {
      setAnalyzing(false)
    }
  }, [jd])

  const getInsights = useCallback(async (index: number, questionText: string) => {
    setInsights(prev => ({
      ...prev,
      [index]: { text: '', quotes: [], loading: true, error: null },
    }))

    try {
      const res = await fetch('/api/jd/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: questionText }),
      })

      if (!res.ok) {
        const data = await res.json()
        setInsights(prev => ({
          ...prev,
          [index]: { ...prev[index], loading: false, error: data.error || 'Failed' },
        }))
        return
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done: streamDone, value } = await reader.read()
        if (streamDone) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const payload = JSON.parse(line.slice(6))
              if (payload.token) {
                setInsights(prev => ({
                  ...prev,
                  [index]: { ...prev[index], text: prev[index].text + payload.token },
                }))
              }
              if (payload.done) {
                setInsights(prev => ({
                  ...prev,
                  [index]: { ...prev[index], loading: false, quotes: payload.quotes || [] },
                }))
              }
              if (payload.error) {
                setInsights(prev => ({
                  ...prev,
                  [index]: { ...prev[index], loading: false, error: payload.error },
                }))
              }
            } catch {
              // skip
            }
          }
        }
      }
    } catch {
      setInsights(prev => ({
        ...prev,
        [index]: { ...prev[index], loading: false, error: 'Failed to connect' },
      }))
    }
  }, [])

  const parsedQuestions = done ? parsePredictions(streamedText) : []
  const hasResults = streamedText || matchedQuestions.length > 0

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <Link
        href="/"
        className="text-accent hover:text-accent/80 text-sm font-medium mb-6 inline-block"
      >
        &larr; Home
      </Link>

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-ink mb-2">
          JD Interview Predictor
        </h1>
        <p className="text-ink/60">
          Paste a job description and our AI will predict likely interview questions — powered by insights from top PM YouTube channels.
        </p>
      </div>

      {/* Input */}
      <div className="bg-cream-dark/30 border border-cream-dark rounded-lg p-6 mb-6">
        <label className="block text-sm font-medium text-ink/70 mb-2">
          <FileText size={14} className="inline mr-1.5 -mt-0.5" />
          Job Description
        </label>
        <textarea
          value={jd}
          onChange={e => setJd(e.target.value)}
          placeholder="Paste the full job description here..."
          rows={8}
          className="w-full bg-cream border border-cream-dark rounded-lg px-4 py-3 text-ink text-sm leading-relaxed placeholder:text-ink/30 focus:outline-none focus:ring-2 focus:ring-accent/30 resize-y"
          disabled={analyzing}
        />
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-ink/40">
            {jd.length > 0 ? `${jd.length} characters` : ''}
          </span>
          <button
            onClick={analyze}
            disabled={analyzing || jd.trim().length < 50}
            className="px-6 py-2.5 bg-accent text-white rounded-lg font-medium hover:opacity-90 transition text-sm inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {analyzing ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                Analyzing...
              </>
            ) : (
              <>
                <Sparkles size={16} />
                Predict Questions
              </>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-red-600 text-sm">
          {error}
        </div>
      )}

      {/* Streaming raw text while generating */}
      {analyzing && streamedText && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-ink mb-4">
            Predicting Questions...
          </h2>
          <div className="bg-cream-dark/30 border border-cream-dark rounded-lg p-6">
            <div className="text-sm text-ink/70 whitespace-pre-line leading-relaxed">
              {streamedText}
              <span className="inline-block w-1.5 h-4 bg-accent/60 animate-pulse ml-0.5 align-middle" />
            </div>
          </div>
        </div>
      )}

      {/* Parsed question cards (after done) */}
      {done && parsedQuestions.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-ink mb-4">
            Predicted Interview Questions
          </h2>
          <div className="space-y-3">
            {parsedQuestions.map((q, i) => (
              <QuestionCard
                key={i}
                q={q}
                index={i}
                insight={insights[i]}
                onGetInsights={() => getInsights(i, q.title)}
              />
            ))}
          </div>
          <div className="mt-3 text-xs text-ink/40">
            Predictions powered by AI + expert insights from YouTube
          </div>
        </div>
      )}

      {/* Matched Questions from Bank */}
      {matchedQuestions.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-ink mb-4">
            Related Questions from Our Bank
          </h2>
          <div className="space-y-3">
            {matchedQuestions.map(q => (
              <Link
                key={q.id}
                href={`/questions/${q.id}`}
                className="block bg-cream-dark/30 border border-cream-dark rounded-lg p-4 hover:shadow hover:border-accent/30 transition group"
              >
                <div className="flex items-start justify-between gap-4">
                  <p className="text-sm text-ink group-hover:text-accent transition flex-1">
                    {q.content}
                  </p>
                  <ArrowRight size={16} className="text-ink/30 group-hover:text-accent shrink-0 mt-0.5" />
                </div>
                <div className="flex gap-2 mt-2">
                  {q.frequency > 1 && (
                    <span className="px-2 py-0.5 bg-accent/10 text-accent text-xs rounded">
                      Asked {q.frequency}x
                    </span>
                  )}
                  {q.question_types?.slice(0, 2).map(t => (
                    <span key={t} className="px-2 py-0.5 bg-cream-dark text-ink/50 text-xs rounded">
                      {t}
                    </span>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!hasResults && !analyzing && !error && (
        <div className="text-center py-12 text-ink/40 text-sm">
          Paste a job description above to get started
        </div>
      )}
    </div>
  )
}
