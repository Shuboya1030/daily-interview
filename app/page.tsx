import Link from 'next/link'

export default function Home() {
  return (
    <div className="container mx-auto px-4 py-12">
      {/* Hero Section */}
      <div className="text-center max-w-3xl mx-auto mb-12">
        <h1 className="text-4xl md:text-5xl font-bold mb-4 text-gray-900">
          PM面试高频题智能平台
        </h1>
        <p className="text-xl text-gray-600 mb-8">
          自动聚合顶级信息源，AI识别高频考点
          <br />
          <span className="text-primary-600 font-semibold">
            不求大而全，但求精而准
          </span>
        </p>
        <div className="flex flex-wrap gap-4 justify-center">
          <Link
            href="/questions"
            className="px-8 py-3 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition"
          >
            开始浏览题目
          </Link>
          <a
            href="#features"
            className="px-8 py-3 border border-gray-300 rounded-lg font-medium hover:border-primary-600 hover:text-primary-600 transition"
          >
            了解更多
          </a>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16 max-w-4xl mx-auto">
        <div className="text-center p-6 bg-white rounded-lg border">
          <div className="text-3xl font-bold text-primary-600 mb-2">
            3000+
          </div>
          <div className="text-gray-600">精选题目</div>
        </div>
        <div className="text-center p-6 bg-white rounded-lg border">
          <div className="text-3xl font-bold text-primary-600 mb-2">
            100+
          </div>
          <div className="text-gray-600">覆盖公司</div>
        </div>
        <div className="text-center p-6 bg-white rounded-lg border">
          <div className="text-3xl font-bold text-primary-600 mb-2">
            每天
          </div>
          <div className="text-gray-600">自动更新</div>
        </div>
      </div>

      {/* Features */}
      <div id="features" className="max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-12 text-gray-900">
          核心功能
        </h2>
        <div className="grid md:grid-cols-2 gap-8">
          <div className="p-6 border rounded-lg hover:shadow-lg transition">
            <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center mb-4">
              <svg
                className="w-6 h-6 text-primary-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
            <h3 className="text-xl font-semibold mb-2">AI高频识别</h3>
            <p className="text-gray-600">
              使用GPT-4智能识别相似题目，自动合并统计频率，让你优先看到最重要的考点
            </p>
          </div>

          <div className="p-6 border rounded-lg hover:shadow-lg transition">
            <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center mb-4">
              <svg
                className="w-6 h-6 text-primary-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <h3 className="text-xl font-semibold mb-2">多源聚合</h3>
            <p className="text-gray-600">
              聚合Product Management Exercises、牛客网、StellarPeers等高质量信息源
            </p>
          </div>

          <div className="p-6 border rounded-lg hover:shadow-lg transition">
            <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center mb-4">
              <svg
                className="w-6 h-6 text-primary-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                />
              </svg>
            </div>
            <h3 className="text-xl font-semibold mb-2">智能筛选</h3>
            <p className="text-gray-600">
              按公司、题型、时间多维度筛选，快速定位你需要的题目
            </p>
          </div>

          <div className="p-6 border rounded-lg hover:shadow-lg transition">
            <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center mb-4">
              <svg
                className="w-6 h-6 text-primary-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                />
              </svg>
            </div>
            <h3 className="text-xl font-semibold mb-2">100% Grounded</h3>
            <p className="text-gray-600">
              所有题目都来自认证的高质量信息源，每条题目都标注来源链接
            </p>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="mt-16 text-center bg-gradient-to-r from-primary-50 to-blue-50 rounded-2xl p-12">
        <h2 className="text-3xl font-bold mb-4 text-gray-900">
          准备好开始了吗？
        </h2>
        <p className="text-xl text-gray-600 mb-8">
          立即浏览高频题目，高效准备PM面试
        </p>
        <Link
          href="/questions"
          className="inline-block px-8 py-3 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition text-lg"
        >
          开始浏览 →
        </Link>
      </div>
    </div>
  )
}
