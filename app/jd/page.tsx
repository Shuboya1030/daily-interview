'use client'

import { useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { Sparkles, FileText, ArrowRight } from 'lucide-react'

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

export default function JDAnalyzerPage() {
  const [jd, setJd] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [streamedText, setStreamedText] = useState('')
  const [matchedQuestions, setMatchedQuestions] = useState<MatchedQuestion[]>([])
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
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

      {/* Parsed question cards (after done) — clickable links */}
      {done && parsedQuestions.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-ink mb-4">
            Predicted Interview Questions
          </h2>
          <p className="text-sm text-ink/50 mb-4">Click a question to explore expert insights</p>
          <div className="space-y-3">
            {parsedQuestions.map((q, i) => {
              const levelColor =
                q.level.includes('Advanced') ? 'bg-red-100 text-red-700' :
                q.level.includes('Intermediate') ? 'bg-yellow-100 text-yellow-700' :
                'bg-green-100 text-green-700'

              return (
                <Link
                  key={i}
                  href={`/jd/q?text=${encodeURIComponent(q.title)}`}
                  className="block bg-cream-dark/30 border border-cream-dark rounded-lg p-5 hover:shadow hover:border-accent/30 transition group"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-accent font-bold text-lg mt-0.5">Q{i + 1}</span>
                    <div className="flex-1">
                      <h3 className="text-base font-semibold text-ink leading-snug group-hover:text-accent transition">
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
                        <span className="text-xs text-accent/60 group-hover:text-accent transition inline-flex items-center gap-1">
                          <Sparkles size={12} />
                          Explore Insights
                        </span>
                      </div>
                    </div>
                    <ArrowRight size={16} className="text-ink/30 group-hover:text-accent shrink-0 mt-1.5" />
                  </div>
                </Link>
              )
            })}
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
