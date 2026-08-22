import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { VitePWA } from 'vite-plugin-pwa';

// `npm run dev` — plain http://localhost for desktop work.
// `npm run dev:lan` — HTTPS on all interfaces so a phone on the same Wi-Fi can open the AR
// viewer (WebXR refuses to run over plain HTTP). The phone will warn about the self-signed cert; accept it once.
// VITE_BASE — sub-path when hosted under e.g. GitHub Pages (/archviz-studio/).
export default defineConfig(({ mode }) => ({
  base: process.env.VITE_BASE ?? '/',
  plugins: [
    react(),
    ...(mode === 'lan' ? [basicSsl()] : []),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg', 'tutorial/poster.jpg'],
      manifest: {
        name: 'ArchViz Studio',
        short_name: 'ArchViz',
        description: 'Type dimensions, see the building in 3D — renders, plans, AR.',
        theme_color: '#1c1f26',
        background_color: '#14161b',
        display: 'standalone',
        orientation: 'any',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [{ name: 'AR demo', url: './?ar=demo', icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }] }],
      },
      workbox: {
        // The tutorial video is large; fetch it on demand instead of precaching.
        globPatterns: ['**/*.{js,css,html,png,svg,jpg,webmanifest}'],
        globIgnores: ['**/tutorial/*.mp4'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: null,
      },
    }),
  ],
  server: mode === 'lan' ? { host: true, port: 5173 } : undefined,
}));
