import { defineConfig } from 'vite'
import logseqDevPluginModule from 'vite-plugin-logseq'
import { resolve } from 'path'

// Handle CJS/ESM interop - the plugin may be double-nested
const logseqDevPlugin =
  typeof logseqDevPluginModule === 'function'
    ? logseqDevPluginModule
    : (logseqDevPluginModule as { default: typeof logseqDevPluginModule }).default

export default defineConfig({
  plugins: [logseqDevPlugin()],
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
