import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: process.env.SHIFT_MANAGER_BASE || '/',
  test: {
    environment: 'node',
  },
})
