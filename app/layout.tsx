import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Link from 'next/link'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'PM Interview Blend',
  description: 'Curated PM interview questions from top sources. Focus. Prepare. Conquer.',
  keywords: 'Product Manager, PM, Interview, Questions, FAANG, Big Tech',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <nav className="border-b border-cream-dark bg-cream sticky top-0 z-50">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <Link href="/" className="text-2xl font-bold text-ink">
                PM Interview Blend
              </Link>
              <Link
                href="/questions"
                className="text-sm font-medium text-ink hover:text-accent transition"
              >
                Browse
              </Link>
            </div>
          </div>
        </nav>
        <main>{children}</main>
        <footer className="border-t border-cream-dark py-8 bg-cream">
          <div className="container mx-auto px-4 text-center text-sm text-ink/60">
            <p>PM Interview Blend</p>
            <p className="mt-2 text-xs">
              Data sources: Product Management Exercises, NowCoder, StellarPeers
            </p>
          </div>
        </footer>
      </body>
    </html>
  )
}
