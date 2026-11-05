// SupabaseKitSource のテスト（本物の Supabase には接続しない。fake-supabase.js を使う）
// 実行：npm test -w packages/core
import test from 'node:test';
import assert from 'node:assert/strict';
import { KitStore, SupabaseKitSource, rowToKit, kitToRow, normalizeKit, DEFAULT_ARCHIVE_NAME } from '../src/data/index.js';
import { createFakeSupabase } from './fake-supabase.js';

const USER = { id: 'user-1', email: 'owner@example.test', password: 'test-only-password' };
const OTHER = { id: 'user-2', email: 'other@example.test', password: 'test-only-password' };
const SOLO = { id: 'user-3', email: 'solo@example.test', password: 'test-only-password' };   // ML_MyTeam を使っていない人
const CLUB = { id: '11111111-1111-4111-8111-111111111111', owner_id: USER.id, name: 'テストクラブ', created_at: '2026-01-01' };
const OTHER_CLUB = { id: '22222222-2222-4222-8222-222222222222', owner_id: OTHER.id, name: '別のクラブ', created_at: '2026-01-01' };
const UNIFORM = { id: 'u-1', club_id: CLUB.id, image_url: 'https://example.test/uniforms/home.png' };
const CLUB_ARCHIVE = { id: 'a-club', owner_id: USER.id, name: CLUB.name, club_id: CLUB.id, created_at: '2026-01-02' };
const fake = (extra = {}) => createFakeSupabase({ users: [USER, OTHER, SOLO], clubs: [CLUB, OTHER_CLUB], uniforms: [UNIFORM], ...extra });
const signIn = (c, u = USER) => c.auth.signInWithPassword({ email: u.email, password: u.password });
const emptyBase = () => ({ name: 'none', writable: false, load: async () => [] });
const kitRow = (over = {}) => ({ id: 'k1', archive_id: CLUB_ARCHIVE.id, club_id: CLUB.id, name: 'n', model_key: 'standard', season_label: null, season_start_year: null, hanger_visible: true, ...over });

test('ログインしていなければ開けない', async () => {
  await assert.rejects(SupabaseKitSource.open(fake()), e => e.code === 'not_signed_in');
});

test('クラブを持つ人：クラブのアーカイブを作って開き、2回目は同じものを開く', async () => {
  const c = fake();
  await signIn(c);
  const a = await SupabaseKitSource.open(c);
  assert.equal(a.archive.club_id, CLUB.id);
  assert.equal(a.label, 'Supabase（テストクラブ）');
  const b = await SupabaseKitSource.open(c);
  assert.equal(b.archiveId, a.archiveId);
  assert.equal(c._db.kit_archives.length, 1);
  // ML_MyTeam からクラブを指定して開いても同じ
  assert.equal((await SupabaseKitSource.open(c, { clubId: CLUB.id })).archiveId, a.archiveId);
});

test('ML_MyTeam を使っていない人：「マイアーカイブ」を作って使える。名前も変えられる', async () => {
  const c = fake();
  await signIn(c, SOLO);
  const src = await SupabaseKitSource.open(c);
  assert.equal(src.archive.club_id, null);
  assert.equal(src.archive.name, DEFAULT_ARCHIVE_NAME);
  const store = new KitStore(emptyBase()); await store.load(); await store.attachUserSource(src);
  const r = await store.add({ id: src.newId(), season: '2020-21', seasonStartYear: 2020, name: '2020-21 Home', type: 'Home', modelUrl: 'models/kit_hanging.glb', seasonId: 'x', legacyUniformId: 'u-1' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(c._db.kits[0].archive_id, src.archiveId);
  assert.equal(c._db.kits[0].club_id, null);
  assert.equal(c._db.kits[0].season_id, null);          // クラブのないアーカイブではひも付けを空にする
  assert.equal(c._db.kits[0].legacy_uniform_id, null);
  await src.rename('私のキット');
  assert.equal(c._db.kit_archives[0].name, '私のキット');
  assert.equal(src.label, 'Supabase（私のキット）');
  // 自分のアーカイブは 1 人 1 つ
  const again = await c.from('kit_archives').insert({ name: '2つ目' });
  assert.ok(again.error);
});

test('行とデータの読み替え：種別の大文字小文字・型紙・画像の参照', () => {
  const row = { id: 'k1', archive_id: 'a', club_id: CLUB.id, season_label: '2026-27', season_start_year: 2026, kit_type: 'gk', variant: null, variant_order: 0, sort_hint: 3,
    name: '2026-27 GK', model_key: 'standard', texture_path: 'a/a.png', collar: 5, display_color: null, display_scale: '1.00',
    hanger_visible: true, is_placeholder: false, season_id: null, legacy_uniform_id: 'u-1', legacy_uniform: { image_url: 'https://x/y.png' }, created_at: 'c', updated_at: 'u' };
  const kit = normalizeKit(rowToKit(row));
  assert.equal(kit.type, 'GK');
  assert.equal(kit.modelUrl, 'models/kit_hanging.glb');
  assert.equal(kit.modelUrlWorn, 'models/kit_base.glb');
  assert.equal(kit.display.texture, 'sb:a/a.png');
  assert.equal(kit.display.scale, 1);
  assert.equal(kit.thumbnailUrl, 'https://x/y.png');
  const back = kitToRow(kit, { id: 'a', club_id: CLUB.id });
  assert.equal(back.archive_id, 'a');
  assert.equal(back.club_id, CLUB.id);
  assert.equal(back.kit_type, 'gk');
  assert.equal(back.texture_path, 'a/a.png');
  assert.equal(back.legacy_uniform_id, 'u-1');
  assert.equal(kitToRow(normalizeKit({ id: 'x', name: 'n', modelUrl: '../export/kit_hanging.glb' }), { id: 'a' }).model_key, 'standard');
  const unset = kitToRow(normalizeKit({ id: 'x', name: 'n', modelUrl: 'm', season: null, seasonStartYear: 2020 }), { id: 'a' });
  assert.equal(unset.season_start_year, null);
});

test('KitStore と組み合わせて：追加 → 読み直し → 編集 → 削除', async () => {
  const c = fake();
  await signIn(c);
  const src = await SupabaseKitSource.open(c);
  const store = new KitStore(emptyBase()); await store.load(); await store.attachUserSource(src);
  const id = src.newId();
  const r = await store.add({ id, season: '2026-27', seasonStartYear: 2026, name: '2026-27 Home', type: 'Home', modelUrl: 'models/kit_hanging.glb', modelUrlWorn: 'models/kit_base.glb', display: { texture: null } });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(c._db.kits[0].club_id, CLUB.id);
  assert.equal(c._db.kits[0].kit_type, 'home');
  const store2 = new KitStore(emptyBase()); await store2.load(); await store2.attachUserSource(await SupabaseKitSource.open(c, { clubId: CLUB.id }));
  assert.deepEqual(store2.list().map(k => [k.id, k.season, k.type, k.name]), [[id, '2026-27', 'Home', '2026-27 Home']]);
  assert.equal((await store.update(id, { season: '2025-26', type: 'Away' })).ok, true);
  assert.equal(c._db.kits[0].season_start_year, 2025);
  assert.equal(c._db.kits[0].kit_type, 'away');
  assert.equal((await store.remove(id)).ok, true);
  assert.equal(c._db.kits.length, 0);
});

test('移行済みのクラブのキット（migration で作ったアーカイブ）をそのまま読み、サムネイルも出る', async () => {
  const c = fake({ archives: [CLUB_ARCHIVE], kits: [kitRow({ legacy_uniform_id: 'u-1', texture_path: `${CLUB.id}/old.png` })] });
  await signIn(c);
  const kits = await (await SupabaseKitSource.open(c)).load();
  assert.equal(kits.length, 1);
  assert.equal(kits[0].thumbnailUrl, UNIFORM.image_url);
  assert.equal(kits[0].display.texture, `sb:${CLUB.id}/old.png`);   // これまでのクラブ id のフォルダの画像も指せる
});

test('キット画像：アーカイブのフォルダに保存し、署名付き URL を使い回す', async () => {
  const c = fake();
  await signIn(c);
  const src = await SupabaseKitSource.open(c);
  const ref = await src.putFile(new Blob(['png'], { type: 'image/png' }), 'image');
  assert.match(ref, new RegExp(`^sb:${src.archiveId}/[0-9a-f-]{36}\\.png$`));
  assert.equal(await src.imageUrl(ref), await src.imageUrl(ref));
  await assert.rejects(src.putFile(new Blob(['x']), 'model'), e => e.code === 'unsupported_type');
  await src.deleteFile(ref);
  assert.equal(c._files.size, 0);
});

test('他の人のアーカイブは読めず、書き込みも拒否される', async () => {
  const theirs = { id: 'a-other', owner_id: OTHER.id, name: '別', club_id: OTHER_CLUB.id };
  const c = fake({ archives: [theirs], kits: [kitRow({ id: 'theirs', archive_id: theirs.id, club_id: OTHER_CLUB.id })] });
  await signIn(c);
  const src = await SupabaseKitSource.open(c);
  assert.equal((await src.load()).length, 0);
  await assert.rejects(new SupabaseKitSource(c, theirs).put(normalizeKit({ id: 'k', name: 'n', modelUrl: 'm' })));
});

test('襟：Supabase の行に保存され、読み直しても同じ', async () => {
  const c = fake();
  await signIn(c);
  const src = await SupabaseKitSource.open(c);
  const store = new KitStore(emptyBase()); await store.load(); await store.attachUserSource(src);
  const id = src.newId();
  await store.add({ id, season: '2020-21', seasonStartYear: 2020, name: '2020-21 Home', type: 'Home', modelUrl: 'models/kit_hanging.glb', display: { collar: 12 } });
  assert.equal(c._db.kits[0].collar, 12);
  assert.equal((await store.update(id, { display: { collar: 5 } })).ok, true);
  const again = new KitStore(emptyBase()); await again.load(); await again.attachUserSource(await SupabaseKitSource.open(c));
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
  saved.set('placeholder-01', { id: 'placeholder-01', overridesBase: true, season: '2020-21', seasonStartYear: 2020, type: 'Home' });
  const s3 = new KitStore(base); await s3.load(); await s3.attachUserSource(userSource);
  assert.equal(s3.get('placeholder-01').display.collar, 2);
  assert.equal(s3.get('placeholder-01').season, '2020-21');
});

test('新規登録：確認メールが要る設定では、確認するまでログインできない', async () => {
  const c = createFakeSupabase({ confirmEmail: true });
  const r = await c.auth.signUp({ email: 'new@example.test', password: 'test-only-password' });
  assert.equal(r.data.session, null);
  assert.equal(c._sent[0].kind, 'confirm');
  assert.ok((await c.auth.signInWithPassword({ email: 'new@example.test', password: 'test-only-password' })).error);
});
