'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Sparkles, RefreshCw } from 'lucide-react'

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

interface SampleAnswer {
  answer_text: string
  source_videos: { title: string; url: string; channel: string }[]
  model_used: string
  generated_at: string
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
  sample_answer: SampleAnswer | null
}

const SOURCE_LABELS: Record<string, string> = {
  'pm_exercises': 'PM Exercises',
  'stellarpeers': 'StellarPeers',
  'nowcoder': 'Nowcoder',
}

function parseInspirationText(answerText: string, sourceVideos: SampleAnswer['source_videos']) {
  // Split at "References:" line
  const refIndex = answerText.search(/\n\s*References:?\s*\n?/i)
  if (refIndex === -1) {
    return { body: answerText.trim(), references: [] }
  }

  const body = answerText.slice(0, refIndex).trim()
  const refSection = answerText.slice(refIndex).replace(/^\n?\s*References:?\s*\n?/i, '')

  // Build a lookup: normalized title -> video info
  const titleMap: Record<string, { title: string; url: string; channel: string }> = {}
  for (const v of sourceVideos) {
    const norm = v.title.toLowerCase().replace(/["""\u2018\u2019]/g, '').trim()
    titleMap[norm] = v
  }

  // Parse each reference line
  const references: { title: string; url: string | null; channel: string | null }[] = []
  const lines = refSection.split('\n').map(l => l.trim()).filter(Boolean)

  for (const line of lines) {
    // Strip leading "- " or "* "
    let text = line.replace(/^[-*]\s*/, '').trim()
    // Strip surrounding quotes
    text = text.replace(/^[""\u201C]|[""\u201D]$/g, '').trim()
    // Remove trailing period
    text = text.replace(/\.$/, '').trim()
    // Extract "by Channel" suffix
    const byMatch = text.match(/^(.+?)\s+by\s+(.+)$/i)
    const titlePart = byMatch ? byMatch[1].replace(/^[""\u201C]|[""\u201D]$/g, '').trim() : text
    const channelPart = byMatch ? byMatch[2].trim() : null

    // Try to match against source videos
    const norm = titlePart.toLowerCase().replace(/["""\u2018\u2019]/g, '').trim()
    const match = titleMap[norm]

    if (match) {
      references.push({ title: match.title, url: match.url, channel: match.channel })
    } else {
      // Fuzzy match: check if any source title contains the reference text or vice versa
      const fuzzy = sourceVideos.find(v =>
        v.title.toLowerCase().includes(norm.slice(0, 30)) ||
        norm.includes(v.title.toLowerCase().slice(0, 30))
      )
      references.push({
        title: titlePart,
        url: fuzzy?.url || null,
        channel: channelPart || fuzzy?.channel || null,
      })
    }
  }

  return { body, references }
}

function InspirationCard({ answer, onRegenerate }: { answer: SampleAnswer; onRegenerate?: () => void }) {
  const { body, references } = parseInspirationText(answer.answer_text, answer.source_videos)

  return (
    <div className="bg-cream-dark/30 border border-cream-dark rounded-lg p-6">
      <div className="prose prose-sm max-w-none text-ink/85 whitespace-pre-line leading-relaxed">
        {body}
      </div>

      {references.length > 0 && (
        <div className="mt-4 pt-3 border-t border-cream-dark">
          <p className="text-xs font-medium text-ink/50 mb-2">References</p>
          <div className="flex flex-col gap-1">
            {references.map((ref, i) => (
              <div key={i} className="text-sm">
                {ref.url ? (
                  <a
                    href={ref.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:text-accent/80 hover:underline"
                  >
                    {ref.title}
                  </a>
                ) : (
                  <span className="text-ink/60">{ref.title}</span>
                )}
                {ref.channel && (
                  <span className="text-ink/40 text-xs ml-1">by {ref.channel}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-cream-dark flex items-center justify-between text-xs text-ink/40">
        <span>Insights powered by AI · {new Date(answer.generated_at).toLocaleDateString('en-US', {
          year: 'numeric', month: 'short', day: 'numeric'
        })}</span>
        {onRegenerate && (
          <button
            onClick={onRegenerate}
            className="px-4 py-1.5 bg-accent/10 border border-accent/30 text-accent rounded-lg transition flex items-center gap-1.5 text-sm font-medium hover:bg-accent/20"
            title="Regenerate with latest knowledge base"
          >
            <RefreshCw size={14} />
            Regenerate
          </button>
        )}
      </div>
    </div>
  )
}

function StreamingCard({ text, generating }: { text: string; generating: boolean }) {
  return (
    <div className="bg-cream-dark/30 border border-cream-dark rounded-lg p-6">
      {generating && !text && (
        <div className="space-y-3 animate-pulse">
          <div className="h-4 bg-cream-dark rounded w-3/4"></div>
          <div className="h-4 bg-cream-dark rounded w-full"></div>
          <div className="h-4 bg-cream-dark rounded w-5/6"></div>
          <div className="h-4 bg-cream-dark rounded w-2/3"></div>
        </div>
      )}
      {text && (
        <div className="prose prose-sm max-w-none text-ink/85 whitespace-pre-line leading-relaxed">
          {text}
          {generating && <span className="inline-block w-1.5 h-4 bg-accent/60 animate-pulse ml-0.5 align-middle" />}
        </div>
      )}
      <div className="mt-4 pt-3 border-t border-cream-dark flex items-center text-xs text-ink/40">
        <Sparkles size={12} className="mr-1.5 text-accent/50" />
        <span>Generating expert inspirations...</span>
      </div>
    </div>
  )
}

export default function QuestionDetailPage() {
  const params = useParams()
  const [question, setQuestion] = useState<QuestionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [streamedText, setStreamedText] = useState('')
  const [generationError, setGenerationError] = useState<string | null>(null)

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

  const generateAnswer = useCallback(async (regenerate = false) => {
    if (!params.id) return

    setGenerating(true)
    setStreamedText('')
    setGenerationError(null)

    if (regenerate) {
      setQuestion(prev => prev ? { ...prev, sample_answer: null } : null)
    }

    try {
      const url = `/api/questions/${params.id}/generate-answer${regenerate ? '?regenerate=true' : ''}`
      const res = await fetch(url, {
        method: 'POST',
      })

      // Check if it's a cached JSON response
      const contentType = res.headers.get('content-type') || ''
      if (contentType.includes('application/json')) {
        const data = await res.json()
        if (data.error) {
          setGenerationError(data.error)
          setGenerating(false)
          return
        }
        setQuestion(prev => prev ? {
          ...prev,
          sample_answer: {
            answer_text: data.answer_text,
            source_videos: data.source_videos || [],
            model_used: data.model_used,
            generated_at: data.generated_at,
          }
        } : null)
        setGenerating(false)
        return
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
              if (payload.done) {
                // Re-fetch question to get the full sample_answer with source_videos
                const refreshRes = await fetch(`/api/questions/${params.id}`)
                const refreshData = await refreshRes.json()
                if (!refreshData.error) {
                  setQuestion(refreshData)
                }
                setStreamedText('')
              }
              if (payload.error) {
                setGenerationError(payload.error)
              }
            } catch {
              // skip malformed JSON
            }
          }
        }
      }
    } catch (err) {
      console.error('Generation failed:', err)
      setGenerationError('Failed to connect to the server')
    } finally {
      setGenerating(false)
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

  const isAIDomainKnowledge = (question.question_types || []).includes('AI Domain Knowledge')

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

      {/* Expert Inspirations Section — only for AI Domain Knowledge questions */}
      {isAIDomainKnowledge && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-ink mb-4">
            Expert Inspirations
          </h2>

          {question.sample_answer ? (
            <InspirationCard
              answer={question.sample_answer}
              onRegenerate={() => generateAnswer(true)}
            />
          ) : generating || streamedText ? (
            <StreamingCard text={streamedText} generating={generating} />
          ) : (
            <div className="bg-cream-dark/20 border border-dashed border-cream-dark rounded-lg p-8 text-center">
              {generationError ? (
                <>
                  <p className="text-red-500/70 text-sm mb-3">{generationError}</p>
                  <button
                    onClick={() => generateAnswer()}
                    className="px-5 py-2 bg-cream-dark text-ink/70 rounded-lg text-sm hover:bg-cream-dark/80 transition"
                  >
                    Try Again
                  </button>
                </>
              ) : (
                <>
                  <p className="text-ink/60 text-sm mb-1">
                    AI-synthesized insights from our YouTube knowledge base
                  </p>
                  <p className="text-ink/40 text-xs mb-5">
                    Featuring AI Explained, Lenny&apos;s Podcast, Y Combinator, IBM Technology, a16z, and more
                  </p>
                  <button
                    onClick={() => generateAnswer()}
                    className="px-6 py-2.5 bg-accent text-white rounded-lg font-medium hover:opacity-90 transition text-sm inline-flex items-center gap-2"
                  >
                    <Sparkles size={16} />
                    Generate Expert Inspirations
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}

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
