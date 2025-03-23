// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['api.placeholder.com', 'localhost'],
  },
  // Updated CSP configuration that allows PDF rendering
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: `
              default-src 'self'; 
              script-src 'self' 'unsafe-eval' 'unsafe-inline' https://cdnjs.cloudflare.com https://*.clerk.accounts.dev https://apis.google.com https://cdn.jsdelivr.net;
              style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net;
              img-src 'self' data: blob: https://* https://*.clerk.accounts.dev https://*.googleapis.com;
              font-src 'self' data: https://cdnjs.cloudflare.com https://cdn.jsdelivr.net;
              worker-src 'self' blob:;
              connect-src 'self' 
                http://localhost:3001
                https://*.clerk.accounts.dev 
                https://api.clerk.dev 
                https://identitytoolkit.googleapis.com 
                https://firestore.googleapis.com 
                https://*.firebaseio.com 
                https://*.google.com 
                https://*.googleapis.com
                https://cdn.jsdelivr.net;
              frame-src 'self' data:;
              object-src 'self' data:;
              base-uri 'self';
            `.replace(/\s+/g, ' ').trim(),
          },
        ],
      },
    ];
  },
  // Add webpack config for PDF handling
  webpack(config) {
    config.module.rules.push({
      test: /\.pdf$/,
      type: 'asset/resource',
    });
    return config;
  },
};

export default nextConfig;