import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ['@deck.gl/core', '@deck.gl/layers', '@deck.gl/react', '@deck.gl/geo-layers'],
  turbopack: {
    resolveAlias: {
      'mapbox-gl': 'maplibre-gl',
    },
  },
  env: {
    NEXT_PUBLIC_GEE_API_KEY: process.env.NEXT_PUBLIC_GEE_API_KEY ?? '',
  },
};

export default nextConfig;
