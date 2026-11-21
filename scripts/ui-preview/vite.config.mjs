import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: [
      { find: '@', replacement: fileURLToPath(new URL('../../src', import.meta.url)) },
      {
        find: /^\$$/,
        replacement: fileURLToPath(new URL('./userscript-mock.js', import.meta.url)),
      },
    ],
  },
  server: { host: '127.0.0.1', open: '/scripts/ui-preview/' },
})
