/** @type {import('next').NextConfig} */
const nextConfig = {
  // Strict mode double-mounts effects in dev, which makes Leaflet throw
  // "Map container is already initialized" on some HMR cycles.
  reactStrictMode: false,
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;

