const createNextIntlPlugin = require('next-intl/plugin');

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

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

module.exports = withNextIntl(nextConfig);


