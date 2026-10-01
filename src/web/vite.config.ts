/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Aspire injects the API endpoint through service discovery env vars (WithReference(api)).
const apiTarget =
  process.env.API_HTTPS ??
  process.env.API_HTTP ??
  process.env.services__api__https__0 ??
  process.env.services__api__http__0 ??
  'http://localhost:5080'

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.PORT ?? 5173),
    strictPort: !!process.env.PORT,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: false, secure: false },
    },
  },
  build: {
    outDir: process.env.WEB_OUT_DIR ?? 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
