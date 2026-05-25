import react from '@vitejs/plugin-react'
import {defineConfig} from 'vite'
import svgo from 'vite-plugin-svgo'

export default defineConfig({
  plugins: [
    react(),
    // Inline SVG imports as optimized markup strings (rendered via dangerouslySetInnerHTML).
    // Imports with `?raw`/`?url` query suffixes are not touched and fall back to Vite's defaults.
    svgo({
      multipass: true,
      plugins: [
        {
          name: 'preset-default',
          params: {
            overrides: {
              // viewBox is required for our CSS sizing — never strip it.
              removeViewBox: false,
            },
          },
        },
      ],
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2020',
  },
})
