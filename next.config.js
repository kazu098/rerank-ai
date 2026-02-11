const createNextIntlPlugin = require('next-intl/plugin');

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Vercelでのデプロイ最適化
  output: 'standalone',
  // standaloneビルドに content/ を含める（本番で /ja/docs 等が404にならないように）
  outputFileTracingIncludes: {
    '/*': ['content/docs/**', 'content/blog/**'],
  },
  // 画像最適化
  images: {
    domains: [],
  },
  // dev時の vendor-chunks/tslib 解決エラー対策
  webpack: (config, { isServer }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      tslib: require.resolve('tslib'),
    };
    return config;
  },
}

module.exports = withNextIntl(nextConfig);


