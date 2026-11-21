import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // Server Actions já são estáveis, mas o limite padrão de body é baixo
    // para payloads com anotações; deixamos explícito.
    serverActions: {
      bodySizeLimit: '1mb'
    }
  }
};

export default nextConfig;
