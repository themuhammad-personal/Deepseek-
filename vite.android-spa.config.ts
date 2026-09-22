import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'
import { copyFileSync, mkdirSync, existsSync } from 'fs'

export default defineConfig({
  plugins: [
    tailwindcss(), 
    react(),
    {
      name: 'copy-wasm',
      closeBundle() {
        const src = resolve(__dirname, 'public/ds/sha3_wasm_bg.wasm')
        const destDir = resolve(__dirname, 'android/app/src/main/assets/www/ds')
        const dest = resolve(destDir, 'sha3_wasm_bg.wasm')
        const destRoot = resolve(__dirname, 'android/app/src/main/assets/ds/sha3_wasm_bg.wasm')
        const destRootDir = resolve(__dirname, 'android/app/src/main/assets/ds')
        try {
          if (existsSync(src)) {
            mkdirSync(destDir, { recursive: true })
            copyFileSync(src, dest)
            console.log('[copy-wasm] copied to', dest)
            mkdirSync(destRootDir, { recursive: true })
            copyFileSync(src, destRoot)
            console.log('[copy-wasm] copied to', destRoot)
          }
        } catch (e) {
          console.warn('[copy-wasm] failed', e)
        }
      }
    }
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'android/app/src/main/assets/www',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'android-spa.html'),
    },
  },
  base: './',
})
