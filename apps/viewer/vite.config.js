import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// base: './' — GitHub Pages のサブパス（/kit-archive/）でも claude.ai の公開ページでも、同じ相対パスで読めるようにする
// npm run build:artifact は --mode artifact（GLB の代わりに base64 テキストを読む。Supabase は使わない。src/main.js）
// npm run dev:mock / build:mock は --mode mock（Supabase の代わりにメモリ上の偽物を使う。画面の確認用）
export default defineConfig(({ mode }) => ({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 1000 },
  resolve: mode === 'mock' ? { alias: { '@supabase/supabase-js': fileURLToPath(new URL('./test/fake-supabase-client.js', import.meta.url)) } } : {}
}));
