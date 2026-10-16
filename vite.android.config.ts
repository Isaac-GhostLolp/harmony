import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { readFileSync } from 'fs'

// The renderer alone, as the Android app's web content (Capacitor serves it
// from dist-android). Same aliases and version as electron.vite.config.ts.
const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')) as { version: string }

export default defineConfig({
  root: 'src/renderer',
  base: './',
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  resolve: { alias: { '@': resolve(__dirname, 'src/renderer/src') } },
  build: {
    outDir: resolve(__dirname, 'dist-android'),
    emptyOutDir: true,
    target: 'es2020'
  }
})
