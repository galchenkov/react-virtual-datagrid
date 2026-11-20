import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// собираем сразу в public/ проекта: платформа отдаёт его как статику
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
})
