import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Daily Interview - PM面试高频题智能平台',
  description: '自动聚合Product Manager面试题，AI识别高频考点，助你高效准备面试',
  keywords: 'Product Manager, PM, 面试, Interview, 高频题, FAANG',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN">
      <body className={inter.className}>
        <nav className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="text-2xl font-bold text-primary-600">
                  Daily Interview
                </span>
                <span className="text-sm text-gray-500 hidden sm:inline">
                  PM面试高频题
                </span>
              </div>
              <div className="flex items-center space-x-4 text-sm text-gray-600">
                <span>精选 · 高频 · 准确</span>
              </div>
            </div>
          </div>
        </nav>
        <main className="min-h-screen">{children}</main>
        <footer className="border-t py-8 mt-16 bg-gray-50">
          <div className="container mx-auto px-4 text-center text-sm text-gray-600">
            <p>Daily Interview · 不求大而全，但求精而准</p>
            <p className="mt-2 text-xs">
              数据来源: Product Management Exercises, 牛客网, StellarPeers
            </p>
          </div>
        </footer>
      </body>
    </html>
  )
}
