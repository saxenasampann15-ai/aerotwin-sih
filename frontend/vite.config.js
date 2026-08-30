import { defineConfig } from 'vite'
import react from '@vitejs/react-plugin'

export default defineConfig({
  plugins: [react()],
  base: '/aerotwin-sih/', // 👈 MAKE SURE TO ADD THIS EXACT LINE
})