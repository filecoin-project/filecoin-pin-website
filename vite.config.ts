import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    'process.env': {
      PROVIDER_ADDRESS: '0xa3971A7234a3379A1813d9867B531e7EeB20ae07',
    },
    global: 'globalThis',
  },
  resolve: {
    alias: {
      process: 'process/browser',
      buffer: 'buffer',
    },
  },
})
