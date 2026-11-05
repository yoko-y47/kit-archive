// 画面の確認用（npm run dev:mock）：@supabase/supabase-js の代わりに、メモリ上の偽物を使う。本物の Supabase には接続しない
// ログインに使うテスト用のアカウント（このテストの中だけで使う値）：
//   test-owner@example.test / test-only-password（クラブあり）
//   test-noclub@example.test / test-only-password（クラブなし。初回に自分のアーカイブを作る）
// 新規登録は確認メールが要る設定（メールは送らず、確認するまでログインできない）
import { createFakeSupabase } from '../../../packages/core/test/fake-supabase.js';

const CLUB = { id: '11111111-1111-4111-8111-111111111111', owner_id: 'test-user-1', name: 'テストクラブ', created_at: '2026-01-01' };
export function createClient() {
  return createFakeSupabase({
    users: [
      { id: 'test-user-1', email: 'test-owner@example.test', password: 'test-only-password' },
      { id: 'test-user-2', email: 'test-noclub@example.test', password: 'test-only-password' }
    ],
    clubs: [CLUB],
    uniforms: [{ id: '33333333-3333-4333-8333-333333333333', club_id: CLUB.id, image_url: 'models/../kits.json' }],
    persistKey: 'fake-supabase-session',
    confirmEmail: true
  });
}
