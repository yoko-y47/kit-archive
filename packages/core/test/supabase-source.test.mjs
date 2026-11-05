// SupabaseKitSource のテスト（本物の Supabase には接続しない。fake-supabase.js を使う）
// 実行：npm test -w packages/core
import test from 'node:test';
import assert from 'node:assert/strict';
import { KitStore, SupabaseKitSource, rowToKit, kitToRow, normalizeKit } from '../src/data/index.js';
import { createFakeSupabase } from './fake-supabase.js';

const USER = { id: 'user-1', email: 'owner@example.test', password: 'test-only-password' };
const OTHER = { id: 'user-2', email: 'other@example.test', password: 'test-only-password' };
const CLUB = { id: '11111111-1111-4111-8111-111111111111', owner_id: USER.id, name: 'テストクラブ', created_at: '2026-01-01' };
const OTHER_CLUB = { id: '22222222-2222-4222-8222-222222222222', owner_id: OTHER.id, name: '別のクラブ', created_at: '2026-01-01' };
const UNIFORM = { id: 'u-1', club_id: CLUB.id, image_url: 'https://example.test/uniforms/home.png' };
const fake = (extra = {}) => createFakeSupabase({ users: [USER, OTHER], clubs: [CLUB, OTHER_CLUB], uniforms: [UNIFORM], ...extra });
const signIn = (c, u = USER) => c.auth.signInWithPassword({ email: u.email, password: u.password });

test('ログインしていない・クラブがないときは理由つきで開けない', async () => {
  const c = fake();
  await assert.rejects(SupabaseKitSource.open(c), e => e.code === 'not_signed_in');
  const noClub = createFakeSupabase({ users: [USER], clubs: [] });
  await signIn(noClub);
  await assert.rejects(SupabaseKitSource.open(noClub), e => e.code === 'no_club');
});

test('行とデータの読み替え：種別の大文字小文字・型紙・画像の参照', () => {
  const row = { id: 'k1', club_id: CLUB.id, season_label: '2026-27', season_start_year: 2026, kit_type: 'gk', variant: null, variant_order: 0, sort_hint: 3,
    name: '2026-27 GK', model_key: 'standard', texture_path: `${CLUB.id}/a.png`, collar: 5, display_color: null, display_scale: '1.00',
    hanger_visible: true, is_placeholder: false, season_id: null, legacy_uniform_id: 'u-1', legacy_uniform: { image_url: 'https://x/y.png' }, created_at: 'c', updated_at: 'u' };
  const kit = normalizeKit(rowToKit(row));
  assert.equal(kit.type, 'GK');
  assert.equal(kit.modelUrl, 'models/kit_hanging.glb');
  assert.equal(kit.modelUrlWorn, 'models/kit_base.glb');
  assert.equal(kit.display.texture, `sb:${CLUB.id}/a.png`);
  assert.equal(kit.display.scale, 1);
  assert.equal(kit.thumbnailUrl, 'https://x/y.png');
  assert.equal(kit.legacyUniformId, 'u-1');
  const back = kitToRow(kit, CLUB.id);
  assert.equal(back.kit_type, 'gk');
  assert.equal(back.texture_path, `${CLUB.id}/a.png`);
  assert.equal(back.model_key, 'standard');
  assert.equal(back.legacy_uniform_id, 'u-1');
  // 古い参照先（../export/）も同じ型紙
  assert.equal(kitToRow(normalizeKit({ id: 'x', name: 'n', modelUrl: '../export/kit_hanging.glb' }), CLUB.id).model_key, 'standard');
  // シーズン未設定なら開始年も空（DB の check 制約）
  const unset = kitToRow(normalizeKit({ id: 'x', name: 'n', modelUrl: 'm', season: null, seasonStartYear: 2020 }), CLUB.id);
  assert.equal(unset.season_start_year, null);
});

test('KitStore と組み合わせて：追加 → 読み直し → 編集 → 削除', async () => {
  const c = fake();
  await signIn(c);
  const src = await SupabaseKitSource.open(c);
  assert.equal(src.label, 'Supabase（テストクラブ）');
  const store = new KitStore({ name: 'none', writable: false, load: async () => [] });
  await store.load();
  await store.attachUserSource(src);
  const id = src.newId();
  const r = await store.add({ id, season: '2026-27', seasonStartYear: 2026, name: '2026-27 Home', type: 'Home', modelUrl: 'models/kit_hanging.glb', modelUrlWorn: 'models/kit_base.glb', display: { texture: null } });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(c._db.kits.length, 1);
  assert.equal(c._db.kits[0].club_id, CLUB.id);
  assert.equal(c._db.kits[0].kit_type, 'home');

  // 別の画面（統合版など）で読み直しても同じ
  const store2 = new KitStore({ name: 'none', writable: false, load: async () => [] });
  await store2.load(); await store2.attachUserSource(await SupabaseKitSource.open(c));
  assert.deepEqual(store2.list().map(k => [k.id, k.season, k.type, k.name]), [[id, '2026-27', 'Home', '2026-27 Home']]);

  const u = await store.update(id, { season: '2025-26', type: 'Away' });
  assert.equal(u.ok, true);
  assert.equal(c._db.kits[0].season_label, '2025-26');
  assert.equal(c._db.kits[0].season_start_year, 2025);
  assert.equal(c._db.kits[0].kit_type, 'away');

  const d = await store.remove(id);
  assert.equal(d.ok, true);
  assert.equal(c._db.kits.length, 0);
});

test('サムネイル：ひも付けた 2D 画像（uniforms）の URL を読む', async () => {
  const c = fake({ kits: [{ id: 'k1', club_id: CLUB.id, name: 'n', model_key: 'standard', season_label: null, season_start_year: null, legacy_uniform_id: 'u-1', hanger_visible: true }] });
  await signIn(c);
  const kits = await (await SupabaseKitSource.open(c)).load();
  assert.equal(kits[0].thumbnailUrl, UNIFORM.image_url);
});

test('キット画像：クラブのフォルダに保存し、署名付き URL を使い回す', async () => {
  const c = fake();
  await signIn(c);
  const src = await SupabaseKitSource.open(c);
  const ref = await src.putFile(new Blob(['png'], { type: 'image/png' }), 'image');
  assert.match(ref, new RegExp(`^sb:${CLUB.id}/[0-9a-f-]{36}\\.png$`));
  const a = await src.imageUrl(ref), b = await src.imageUrl(ref);
  assert.equal(a, b);
  await assert.rejects(src.putFile(new Blob(['x']), 'model'), e => e.code === 'unsupported_type');
  await src.deleteFile(ref);
  assert.equal(c._files.size, 0);
});

test('他のクラブのデータは読めず、書き込みも拒否される', async () => {
  const c = fake({ kits: [{ id: 'theirs', club_id: OTHER_CLUB.id, name: 'x', model_key: 'standard', season_label: null, season_start_year: null, hanger_visible: true }] });
  await signIn(c);
  const src = await SupabaseKitSource.open(c);
  assert.equal((await src.load()).length, 0);
  await assert.rejects(new SupabaseKitSource(c, OTHER_CLUB).put(normalizeKit({ id: 'k', name: 'n', modelUrl: 'm' })));
});

test('襟：Supabase の行に保存され、読み直しても同じ', async () => {
  const c = fake();
  await signIn(c);
  const src = await SupabaseKitSource.open(c);
  const store = new KitStore({ name: 'none', writable: false, load: async () => [] });
  await store.load(); await store.attachUserSource(src);
  const id = src.newId();
  await store.add({ id, season: '2020-21', seasonStartYear: 2020, name: '2020-21 Home', type: 'Home', modelUrl: 'models/kit_hanging.glb', display: { collar: 12 } });
  assert.equal(c._db.kits[0].collar, 12);
  const r = await store.update(id, { display: { collar: 5 } });
  assert.equal(r.ok, true);
  assert.equal(c._db.kits[0].collar, 5);
  const again = new KitStore({ name: 'none', writable: false, load: async () => [] });
  await again.load(); await again.attachUserSource(await SupabaseKitSource.open(c));
  assert.equal(again.get(id).display.collar, 5);
});

test('襟：最初からある展示（base）の襟の変更も上書きとして残る', async () => {
  const saved = new Map();
  const userSource = { name: 'mem', label: 'mem', writable: true, load: async () => [...saved.values()], put: async rec => { saved.set(rec.id, rec); } };
  const base = { name: 'json', writable: false, load: async () => [{ id: 'placeholder-01', name: '仮データ 01', modelUrl: 'm', display: { collar: 2 }, placeholder: true }] };
  const s1 = new KitStore(base); await s1.load(); await s1.attachUserSource(userSource);
  await s1.update('placeholder-01', { display: { collar: 9 } });
  assert.equal(saved.get('placeholder-01').collar, 9);
  const s2 = new KitStore(base); await s2.load(); await s2.attachUserSource(userSource);
  assert.equal(s2.get('placeholder-01').display.collar, 9);
  // 襟を持たない古い上書きは、元の襟のまま
  saved.set('placeholder-01', { id: 'placeholder-01', overridesBase: true, season: '2020-21', seasonStartYear: 2020, type: 'Home' });
  const s3 = new KitStore(base); await s3.load(); await s3.attachUserSource(userSource);
  assert.equal(s3.get('placeholder-01').display.collar, 2);
  assert.equal(s3.get('placeholder-01').season, '2020-21');
});
