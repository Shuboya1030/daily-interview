'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

function getVisitorId(): string {
  const key = '_vid'
  let id = localStorage.getItem(key)
  if (!id) {
    id = Math.random().toString(36).substring(2) + Date.now().toString(36)
    localStorage.setItem(key, id)
  }
  return id
}

export default function PageTracker() {
  const pathname = usePathname()

  useEffect(() => {
    // Don't track the hidden analytics page itself
    if (pathname.startsWith('/d/')) return

    try {
      const visitor_id = getVisitorId()
      fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: pathname,
          visitor_id,
          referrer: document.referrer || null,
        }),
      }).catch(() => {}) // fire and forget
    } catch {
      // ignore
    }
  }, [pathname])

  return null
}
