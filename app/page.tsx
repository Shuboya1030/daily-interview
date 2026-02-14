import Image from 'next/image'
import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen flex items-center">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          {/* Left — Punchline */}
          <div>
            <h1 className="text-5xl md:text-7xl font-bold leading-tight text-ink">
              Focus.
              <br />
              Prepare.
              <br />
              Conquer.
            </h1>
            <p className="mt-6 text-xl md:text-2xl text-ink/70">
              With{' '}
              <span className="text-accent font-semibold">
                PM Interview Blend
              </span>
              .
            </p>
            <Link
              href="/questions"
              className="mt-8 inline-block px-8 py-3 bg-accent text-white rounded-lg font-medium hover:opacity-90 transition text-lg"
            >
              Explore Questions &rarr;
            </Link>
          </div>

          {/* Right — Hero image */}
          <div className="flex justify-center">
            <Image
              src="/hero-arrow.jpg"
              alt="Arrow hitting the target — line art"
              width={700}
              height={560}
              className="w-full max-w-2xl"
              priority
            />
          </div>
        </div>
      </div>
    </div>
  )
}
