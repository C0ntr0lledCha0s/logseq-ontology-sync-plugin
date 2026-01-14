import { defineConfig } from 'vite'
import logseqDevPlugin from 'vite-plugin-logseq'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    logseqDevPlugin(),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    target: 'esnext',
    minify: 'esbuild',
    sourcemap: true,
  },
})
