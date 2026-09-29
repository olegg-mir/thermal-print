import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/thermal-print/',
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Thermal Print',
        short_name: 'Thermal Print',
        description: 'Create and print product labels with Bluetooth thermal printers',
        lang: 'ru',
        start_url: '/thermal-print/',
        scope: '/thermal-print/',
        display: 'standalone',
        background_color: '#f5f3f7',
        theme_color: '#6750a4',
        icons: [
          {
            src: '/thermal-print/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/thermal-print/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
          { src: '/thermal-print/icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        navigateFallback: '/thermal-print/index.html',
      },
    }),
  ],
  test: { environment: 'node' },
});
