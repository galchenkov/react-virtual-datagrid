import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// По умолчанию сборка идёт в dist/ — так репозиторий датагрида собирается сам по себе.
// На платформе (baseone) статика отдаётся из public/, поэтому там сборка запускается
// с GRID_OUT_DIR=../public (см. скрипт build:site в package.json).
export default defineConfig({
  plugins: [react()],
  build: { outDir: process.env.GRID_OUT_DIR || 'dist', emptyOutDir: true },
})
