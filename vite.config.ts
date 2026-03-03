import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import tailwindcss from '@tailwindcss/vite'
import { createRequire } from 'module'
import { resolve } from 'path'

// Portable ESM-compatible require for resolving node_modules paths
const _require = createRequire(import.meta.url)

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
      routesDirectory: './src/frontend/routes',
      generatedRouteTree: './src/frontend/routeTree.gen.ts',
    }),
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
    tailwindcss(),
  ],

  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },

  // Recharts uses decimal.js-light (ships only a CJS default export).
  // Vite's ESM transform breaks it at runtime: "not a constructor".
  // Alias to the package's own .mjs file so Vite bundles the ESM build.
  optimizeDeps: {
    include: ['decimal.js-light'],
  },
  resolve: {
    alias: {
      'decimal.js-light': resolve(
        _require.resolve('decimal.js-light/decimal.mjs')
      ),
    },
  },
})
