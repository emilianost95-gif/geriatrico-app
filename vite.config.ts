/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'node:fs'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

export default defineConfig(({ mode }) => ({
  // Rutas relativas: la app funciona en cualquier carpeta o hosting estático
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // En el APK (npm run build:android) no hace falta: la app ya viene instalada
      disable: mode === 'android',
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Registro Geriátrico',
        short_name: 'Geriátrico',
        description: 'Registro diario de pacientes',
        lang: 'es',
        theme_color: '#3f6b5c',
        background_color: '#faf7f0',
        display: 'standalone',
        start_url: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // ExcelJS pesa ~1 MB: se precachea igual para que funcione sin internet
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
  build: {
    // ExcelJS (~900 KB) se carga solo al usar Excel
    chunkSizeWarningLimit: 1000,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Las pruebas que arman archivos .xlsx de verdad pueden tardar bastante
    // en una PC con menos CPU o con el antivirus mirando: el límite por defecto (5 s) se queda corto.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
}))
