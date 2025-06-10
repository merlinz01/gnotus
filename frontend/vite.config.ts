/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      // Resolves "react/jsx-runtime" not found error in VSCode test explorer
      // jsxRuntime: process.env.VITEST_VSCODE ? "classic" : undefined,
    }),
    tailwindcss(),
  ],
  build: {
    assetsDir: '_static',
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
