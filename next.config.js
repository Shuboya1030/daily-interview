/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: [
      'www.productmanagementexercises.com',
      'nowcoder.com',
      'stellarpeers.com',
    ],
  },
  experimental: {
    serverActions: true,
  },
}

module.exports = nextConfig
