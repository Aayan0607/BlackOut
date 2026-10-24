import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'blackout-offline-manifest',
      generateBundle(_options, bundle) {
        this.emitFile({
          type: 'asset',
          fileName: 'offline-assets.json',
          source: JSON.stringify({
            files: [
              '/index.html',
              '/icon.svg',
              '/icon-192.png',
              '/icon-512.png',
              '/manifest.webmanifest',
              ...Object.keys(bundle)
                .filter((name) => /\.(js|css|wasm)$/.test(name))
                .map((name) => `/${name}`),
            ],
          }),
        })
      },
    },
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'BlackOut Expedition Log',
        short_name: 'BlackOut',
        description: 'Carry your expedition updates beyond the network.',
        theme_color: '#172a25',
        background_color: '#f4f3eb',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,svg,png,wasm,json}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: { include: ['src/**/*.test.ts'], environment: 'node', setupFiles: ['tests/setup.ts'] },
})
