/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Vercelでのデプロイ最適化
  output: 'standalone',
  // 画像最適化
  images: {
    domains: [],
  },
}

module.exports = nextConfig


