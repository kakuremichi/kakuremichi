/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  output: 'standalone',
  experimental: {},
  // WebSocket サーバー用のカスタムサーバーを使用しない場合
  // Phase 1 では開発を簡略化するため、WebSocket は別ポートで起動
};

module.exports = nextConfig;
