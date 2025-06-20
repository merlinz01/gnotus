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
    host: process.env.VITE_HOST || 'localhost',
    port: parseInt(process.env.VITE_PORT || '5173', 10),
    proxy: {
      '/api': {
        target: process.env.API_ADDRESS || 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
