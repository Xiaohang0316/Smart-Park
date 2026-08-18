import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173
  },
  build: {
    // three.js / echarts 体积较大, 仅调整告警阈值, 不做分包
    chunkSizeWarningLimit: 1600
  }
})
