import { defineConfig } from 'vite';

// base: './' — GitHub Pages のサブパス（/kit-archive/）でも claude.ai の公開ページでも、同じ相対パスで読めるようにする
// npm run build:artifact は --mode artifact（GLB の代わりに base64 テキストを読む。src/main.js の resolveModelUrls）
export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 1000 }
});
