// 追加したユニフォームの保存先（kit-data.js の source と同じ形。3D 表示には依存しない）
// - ローカル（http サーバーで開いたとき）など claude.ai の外：ブラウザ内の IndexedDB
// - claude.ai で公開したアーティファクト：アーティファクトの db（データ）と assets（ファイル）
// どちらも、ユニフォームのデータ（1着 = 1件）と、GLB・サムネイルのファイル本体を保存する。
// ファイルは「idb:<id>」「asset:<id>」という参照（modelUrl / thumbnailUrl）でデータから指す。
// 外部サービスの接続情報・認証情報は使わない（claude.ai の保存機能は、開いている人の権限で動く）

export const MAX_GLB_BYTES = 15 * 1024 * 1024;        // GLB の上限（claude.ai では base64 にすると 20MB の上限に収まる大きさ）
export const MAX_THUMB_BYTES = 5 * 1024 * 1024;       // サムネイル画像の上限
export const THUMB_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const MAX_TEXTURE_BYTES = 16 * 1024 * 1024;   // キット画像（PNG）の上限（claude.ai の 1 ファイル 20MB の上限に収まる大きさ）

export const isStoredUrl = url => /^(idb|asset|sb):/.test(String(url ?? ''));   // sb: は supabase.js（Supabase のバケット）

const newId = () => (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : Date.now().toString(36) + Math.random().toString(36).slice(2));

function toBase64(buf) {
  const u8 = new Uint8Array(buf); let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromBase64(text) {
  const bin = atob(text.trim()), buf = new Uint8Array(bin.length);
  for (let k = 0; k < bin.length; k++) buf[k] = bin.charCodeAt(k);
  return buf.buffer;
}

// ---- ブラウザ内（IndexedDB） ----
// データベース kit-archive：kits（ユニフォームのデータ、キーは id）と files（GLB・画像の Blob）
// そのブラウザ・その端末だけに残る。サイトのデータを消すと消える
export class IndexedDbSource {
  constructor(db) {
    this.db = db; this.name = 'indexeddb'; this.writable = true;
    this.label = 'このブラウザ（IndexedDB）';
    this.urls = new Map();   // idb:<id> → 表示用の object URL
  }
  static open() {
    return new Promise((ok, ng) => {
      if (!('indexedDB' in globalThis)) { ng(new Error('IndexedDB を使えません')); return; }
      let req;
      try { req = indexedDB.open('kit-archive', 1); } catch (e) { ng(e); return; }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('kits')) db.createObjectStore('kits', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('files')) db.createObjectStore('files');
      };
      req.onsuccess = () => ok(new IndexedDbSource(req.result));
      req.onerror = () => ng(req.error || new Error('IndexedDB を開けません'));
      req.onblocked = () => ng(new Error('IndexedDB が別のタブで使用中です'));
    });
  }
  #tx(store, mode, fn) {
    return new Promise((ok, ng) => {
      const tx = this.db.transaction(store, mode), st = tx.objectStore(store);
      const req = fn(st);
      tx.oncomplete = () => ok(req?.result);
      tx.onerror = () => ng(tx.error || req?.error);
      tx.onabort = () => ng(tx.error || new Error('保存が中断されました（容量不足の可能性があります）'));
    });
  }
  load() { return this.#tx('kits', 'readonly', st => st.getAll()); }
  put(kit) { return this.#tx('kits', 'readwrite', st => st.put(kit)); }
  delete(id) { return this.#tx('kits', 'readwrite', st => st.delete(id)); }
  async putFile(blob) {
    const id = newId();
    await this.#tx('files', 'readwrite', st => st.put(blob, id));
    return 'idb:' + id;
  }
  async deleteFile(url) { await this.#tx('files', 'readwrite', st => st.delete(url.slice(4))); }
  async #blob(url) {
    const b = await this.#tx('files', 'readonly', st => st.get(url.slice(4)));
    if (!b) throw new Error('保存したファイルが見つかりません: ' + url);
    return b;
  }
  async readModel(url) { return (await this.#blob(url)).arrayBuffer(); }
  async imageUrl(url) {
    if (!this.urls.has(url)) this.urls.set(url, URL.createObjectURL(await this.#blob(url)));
    return this.urls.get(url);
  }
}

// ---- claude.ai のアーティファクト（db ＋ assets） ----
// データは db の kits/<id>、ファイルは assets。GLB は assets が受け付けない形式なので、base64 テキストにして保存する
// 書き込めるのは、このアーティファクトの編集権限がある人だけ（assets が null のときは読み取り専用）
export class ClaudeArtifactSource {
  constructor(db, assets) {
    this.db = db; this.assets = assets; this.name = 'claude.ai';
    this.writable = !!assets;
    this.label = 'claude.ai（このアーティファクト）';
  }
  static async open() {
    const use = globalThis.claude?.use;
    if (typeof use !== 'function') return null;
    const [db, assets] = await Promise.all([use('db'), use('assets')]);
    return db ? new ClaudeArtifactSource(db, assets) : null;
  }
  async load() {
    const snap = await this.db.collection('kits').get();
    return snap.docs.filter(d => d.exists).map(d => ({ ...d.data() }));
  }
  put(kit) { return this.db.doc('kits/' + kit.id).set(JSON.parse(JSON.stringify(kit))); }
  delete(id) { return this.db.doc('kits/' + id).delete(); }
  async putFile(blob, kind) {
    const up = kind === 'model'
      ? new Blob([toBase64(await blob.arrayBuffer())], { type: 'text/plain' })
      : blob;
    const r = await this.assets.upload(up, { type: kind === 'model' ? 'text/plain' : blob.type || 'image/png' });
    return 'asset:' + r.id;
  }
  async deleteFile(url) { if (this.assets) await this.assets.delete(url.slice(6)); }
  async readModel(url) {
    const res = await fetch('/_blob/' + url.slice(6));
    if (!res.ok) throw new Error(url + ': ' + res.status);
    return fromBase64(await res.text());
  }
  async imageUrl(url) { return '/_blob/' + url.slice(6); }
}

// 保存先を選ぶ：claude.ai で開いていて db が使えればそれ、なければ IndexedDB。どちらも使えなければ null
export async function openUserSource() {
  try { const c = await ClaudeArtifactSource.open(); if (c) return c; } catch (e) { console.warn('claude.ai の保存機能を使えません', e); }
  try { return await IndexedDbSource.open(); } catch (e) { console.warn('IndexedDB を使えません', e); }
  return null;
}

// 保存の失敗を、画面に出す文に直す
export function describeStorageError(e) {
  const code = e?.code;
  if (code === 'too_large') return 'ファイルが大きすぎます';
  if (code === 'unsupported_type') return 'この形式のファイルは保存できません';
  if (code === 'quota_or_state' || code === 'quota_exceeded' || e?.name === 'QuotaExceededError') return '保存できる容量を超えました';
  if (code === 'not_granted' || code === 'upstream_auth') return '保存する権限がありません（再読み込みするか、サインインし直してください）';
  if (code === 'rate_limited' || code === 'resource_exhausted') return '短時間に操作が集中しました。少し待ってからもう一度お試しください';
  return e?.message || String(e);
}
