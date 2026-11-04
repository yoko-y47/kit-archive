// ユニフォームのデータ管理層（3D 表示には依存しない）
// - データ構造の正規化と検証
// - 展示順（並び順）の規則
// - ストア：追加・更新・削除と変更の通知。保存先（source）は差し替えられる
//
// 3D 表示側はストアの変更通知を受けて表示を合わせるだけにする。
// 管理画面・アップロード・データベースは、このファイルの source とストアの操作に接続する。

export const SCHEMA_VERSION = 3;

// カテゴリと、同じシーズン内の並び順（手前から）。固定値
export const CATEGORIES = Object.freeze(['Home', 'Away', 'Third', 'Cup', 'GK']);
export const CATEGORY_ORDER = Object.freeze({ Home: 0, Away: 1, Third: 2, Cup: 3, GK: 4 });
const UNSET_ORDER = 99;   // シーズン・カテゴリが未設定のものは、それぞれの並びの一番奥

// "2026-27" → 2026、"2026" → 2026。読めなければ null
export function parseSeasonStartYear(season) {
  const m = String(season ?? '').match(/\d{4}/);
  return m ? +m[0] : null;
}
// "home" / "HOME" → "Home"。一覧にないものは null
export function normalizeCategory(type) {
  if (type === null || type === undefined || type === '') return null;
  const t = String(type).trim().toLowerCase();
  return CATEGORIES.find(c => c.toLowerCase() === t) ?? null;
}

// 1着分のデータ（正規化後）
// {
//   id: string                     一意の ID（必須）
//   season: string | null          シーズン表記（例 "2026-27"）。未設定なら null
//   seasonStartYear: number | null シーズン開始年。省略時は season から読む
//   name: string                   ユニフォーム名
//   type: 'Home'|'Away'|'Third'|'Cup'|'GK'|null  カテゴリ。未設定なら null
//   variant: string | null         同じシーズン・カテゴリ内の識別（任意。例 "長袖"、"選手用"）
//   variantOrder: number           バリエーション同士の並び（任意、既定 0）
//   modelUrl: string               GLB の参照先（必須。吊り下げ形）
//   modelUrlWorn: string | null    着用形の GLB（任意）
//   thumbnailUrl: string | null    サムネイル（任意）
//   hanger: { visible: boolean }   ハンガーの表示設定
//   display: { collar, color, texture, scale }  表示の調整（任意）
//   placeholder: boolean           仮データ（実際のシーズン・カテゴリなどが未確認）
//   sortHint: number               シーズン・カテゴリ・バリエーションが同じときの並び（任意、既定 0）
//   createdAt / updatedAt: string | null  ISO 日時（任意。データベース移行用）
// }
export function normalizeKit(raw) {
  const r = raw || {};
  const season = r.season === undefined || r.season === '' ? null : r.season === null ? null : String(r.season);
  // 旧形式（schema 2: glb / glbWorn / seasonStart / collar / color / texture / scale）も読めるようにする
  const yearIn = r.seasonStartYear ?? r.seasonStart;
  const seasonStartYear = yearIn !== undefined && yearIn !== null && Number.isFinite(+yearIn) ? +yearIn : parseSeasonStartYear(season);
  const d = r.display || {};
  return {
    id: r.id === undefined || r.id === null ? '' : String(r.id),
    season,
    seasonStartYear,
    name: String(r.name ?? ''),
    type: normalizeCategory(r.type),
    typeRaw: r.type ?? null,
    variant: r.variant === undefined || r.variant === '' ? null : r.variant,
    variantOrder: Number.isFinite(+r.variantOrder) ? +r.variantOrder : 0,
    modelUrl: r.modelUrl ?? r.glb ?? '',
    modelUrlWorn: r.modelUrlWorn ?? r.glbWorn ?? null,
    thumbnailUrl: r.thumbnailUrl ?? null,
    hanger: { visible: r.hanger?.visible !== false },
    display: {
      collar: d.collar ?? r.collar ?? null,
      color: d.color ?? r.color ?? null,
      texture: d.texture ?? r.texture ?? null,
      scale: Number.isFinite(+(d.scale ?? r.scale)) ? +(d.scale ?? r.scale) : 1
    },
    placeholder: r.placeholder === true,
    sortHint: Number.isFinite(+r.sortHint) ? +r.sortHint : 0,
    createdAt: r.createdAt ?? null,
    updatedAt: r.updatedAt ?? null
  };
}
// 保存用の形（typeRaw など内部の値を除く）
export function serializeKit(k) {
  const { typeRaw, ...rest } = k;
  return rest;
}

// 登録できないときの理由（配列）。警告は登録を止めない
export function validateKit(kit, existingIds = new Set()) {
  const errors = [], warnings = [];
  if (!kit.id) errors.push('id がありません');
  else if (existingIds.has(kit.id)) errors.push(`id「${kit.id}」はすでに登録されています`);
  if (!kit.modelUrl) errors.push('modelUrl（GLB の参照先）がありません');
  if (kit.season !== null && kit.seasonStartYear === null) errors.push(`シーズン「${kit.season}」から開始年を読めません（seasonStartYear を指定してください）`);
  if (kit.typeRaw !== null && kit.type === null) warnings.push(`カテゴリ「${kit.typeRaw}」は ${CATEGORIES.join(' / ')} のどれでもないため、未設定として扱います`);
  if (kit.seasonStartYear === null && !kit.placeholder) warnings.push('シーズンが未設定です（並びの一番奥に置きます）');
  return { errors, warnings };
}

// ---- 並び順 ----
// 手前から：
//   1. シーズン開始年が新しい順（数値で比較。未設定は一番奥）
//   2. 同じシーズン内は Home → Away → Third → Cup → GK（未設定は一番奥）
//   3. 同じカテゴリ内は variant なし → variantOrder → variant の名前順
//   4. それでも同じなら sortHint → id（登録順には依存しない）
export function compareKits(a, b) {
  const ya = a.seasonStartYear ?? -Infinity, yb = b.seasonStartYear ?? -Infinity;
  return (yb - ya || 0)
    || (CATEGORY_ORDER[a.type] ?? UNSET_ORDER) - (CATEGORY_ORDER[b.type] ?? UNSET_ORDER)
    || (a.variant === null ? 0 : 1) - (b.variant === null ? 0 : 1)
    || a.variantOrder - b.variantOrder
    || String(a.variant ?? '').localeCompare(String(b.variant ?? ''))
    || a.sortHint - b.sortHint
    || a.id.localeCompare(b.id);
}
export const sortKits = kits => [...kits].sort(compareKits);

// ---- 保存先（source） ----
// 形：{ name, writable, load(): Promise<raw[]>, save?(kits): Promise<void> }
// JSON ファイル（読み取り専用）。今の公開版・ローカル表示はこれを使う
export class JsonFileSource {
  constructor(url) { this.url = url; this.name = 'json:' + url; this.writable = false; }
  async load() {
    const res = await fetch(this.url);
    if (!res.ok) throw new Error(this.url + ': ' + res.status);
    const json = await res.json();
    return Array.isArray(json) ? json : json.kits || [];
  }
}
// メモリだけ（テスト用。ページを閉じると消える）
export class MemorySource {
  constructor(kits = []) { this.kits = kits; this.name = 'memory'; this.writable = true; }
  async load() { return this.kits.map(k => ({ ...k })); }
  async save(kits) { this.kits = kits.map(k => ({ ...k })); }
}
// 例：データベースにつなぐときは、同じ形の source を作って KitStore に渡す
//   class SupabaseSource { constructor(client, table) {...} async load() {...} async save(kits) {...} }
// 接続情報（URL・キー）はここには書かない。設定する画面・環境変数から渡す

// 同じシーズン・同じカテゴリのもの（重複登録の確認用。登録は止めない）
export function findSameSlot(kits, seasonStartYear, type) {
  if (seasonStartYear === null || type === null) return [];
  return [...kits].filter(k => k.seasonStartYear === seasonStartYear && k.type === type);
}

// 一意の ID：kit-<開始年>-<カテゴリ>-<乱数>（例 kit-2026-home-3f9a1c2b）
export function newKitId(seasonStartYear, type, existing = new Set()) {
  for (;;) {
    const rnd = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(16).slice(2) + Date.now().toString(16)).replace(/-/g, '').slice(0, 8);
    const id = ['kit', seasonStartYear ?? 'na', String(type ?? 'na').toLowerCase(), rnd].join('-');
    if (!existing.has(id)) return id;
  }
}

// ---- ストア ----
// 1着ずつ独立したデータとして持ち、追加・更新・削除のたびに変更を通知する。
// 通知：{ type: 'reset' | 'add' | 'update' | 'remove', kit?, added?, kits }（kits は並べ替え済みの配列。added はまとめて追加したもの）
// 保存先は2つ：
//   source      最初から展示している分（kits.json。読み取り専用）
//   userSource  ユーザーが追加した分（kit-storage.js の IndexedDB / claude.ai）。attachUserSource で後からつなぐ
// ユーザーが追加した分は、保存に成功してから展示に反映する（保存に失敗したら展示しない）
// 最初から展示している分（base）を画面で編集したときは、変えた項目だけを userSource に「上書き」として保存する
//   { id: <base の id>, overridesBase: true, season, seasonStartYear, type, updatedAt }
//   kits.json はそのまま。読み込むたびに kits.json の内容へ上書きを重ねる
export const BASE_EDITABLE = Object.freeze(['season', 'seasonStartYear', 'type']);
export class KitStore {
  constructor(source) {
    this.source = source; this.userSource = null;
    this.kits = new Map(); this.origin = new Map();   // id → 'base' | 'user' | 'memory'
    this.overrides = new Map();   // base の id → 保存した上書き
    this.listeners = new Set(); this.rejected = [];
  }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(type, kit, extra) { const kits = this.list(); for (const fn of this.listeners) fn({ type, kit, kits, ...extra }); }
  list() { return sortKits(this.kits.values()); }
  get(id) { return this.kits.get(id) ?? null; }
  get size() { return this.kits.size; }
  originOf(id) { return this.origin.get(id) ?? null; }
  isEdited(id) { return this.overrides.has(id); }
  get canAdd() { return !!this.userSource?.writable; }

  async load() {
    const raws = await this.source.load();
    this.kits.clear(); this.origin.clear(); this.rejected = [];
    for (const raw of raws) this.#accept(raw, 'base');
    this.emit('reset');
    return this.list();
  }
  // ユーザーが追加した分を読み込んで展示に加える（展示中のものはそのまま）
  async attachUserSource(src) {
    this.userSource = src;
    const raws = await src.load(), added = [];
    for (const raw of raws.filter(r => !r.overridesBase)) { const r = this.#accept(raw, 'user'); if (r.ok) added.push(r.kit); }
    if (added.length) this.emit('add', added[0], { added });
    // base の上書き（元のデータが見つからないものは使わずに残しておく）
    for (const raw of raws.filter(r => r.overridesBase)) {
      const cur = this.kits.get(raw.id);
      if (!cur || this.origin.get(raw.id) !== 'base') { console.warn('上書き先のデータがありません:', raw.id); continue; }
      const patch = Object.fromEntries(BASE_EDITABLE.filter(k => k in raw).map(k => [k, raw[k]]));
      const next = normalizeKit({ ...serializeKit(cur), ...patch, updatedAt: raw.updatedAt ?? cur.updatedAt });
      if (validateKit(next, new Set([...this.kits.keys()].filter(k => k !== raw.id))).errors.length) { console.warn('上書きを使いませんでした:', raw); continue; }
      this.overrides.set(raw.id, raw);
      this.kits.set(raw.id, Object.freeze(next));
      this.emit('update', next);
    }
    return added;
  }
  // 登録前の確認（保存はしない）。返り値 { kit, errors, warnings }
  check(raw) {
    const kit = normalizeKit(raw), { errors, warnings } = validateKit(kit, new Set(this.kits.keys()));
    return { kit, errors, warnings };
  }
  #accept(raw, origin) {
    const { kit, errors, warnings } = this.check(raw);
    warnings.forEach(w => console.warn(`kit ${kit.id}: ${w}`));
    if (errors.length) { this.rejected.push({ raw, errors }); console.warn('登録しませんでした:', errors.join(' / '), raw); return { ok: false, errors }; }
    this.kits.set(kit.id, Object.freeze(kit)); this.origin.set(kit.id, origin);
    return { ok: true, kit };
  }
  // 追加：保存先があれば先に保存し、成功してから展示に加える。保存先がなければメモリだけ（再読み込みで消える）
  async add(raw) {
    const now = new Date().toISOString();
    const { kit, errors, warnings } = this.check({ createdAt: now, updatedAt: now, ...raw });
    if (errors.length) return { ok: false, errors };
    const persist = this.canAdd;
    if (persist) {
      try { await this.userSource.put(serializeKit(kit)); }
      catch (e) { return { ok: false, errors: ['保存に失敗しました'], cause: e }; }
      if (this.kits.has(kit.id)) return { ok: false, errors: [`id「${kit.id}」はすでに登録されています`] };
    }
    warnings.forEach(w => console.warn(`kit ${kit.id}: ${w}`));
    this.kits.set(kit.id, Object.freeze(kit)); this.origin.set(kit.id, persist ? 'user' : 'memory');
    this.emit('add', kit);
    return { ok: true, kit, persisted: persist, warnings };
  }
  async update(id, patch) {
    const cur = this.kits.get(id);
    if (!cur) return { ok: false, errors: [`id「${id}」はありません`] };
    const base = serializeKit(cur);
    // シーズンだけ変えたときは、開始年を新しいシーズンから読み直す
    if ('season' in patch && !('seasonStartYear' in patch)) delete base.seasonStartYear;
    const next = normalizeKit({ ...base, ...patch, id, display: { ...cur.display, ...(patch.display || {}) }, updatedAt: new Date().toISOString() });
    const { errors, warnings } = validateKit(next, new Set([...this.kits.keys()].filter(k => k !== id)));
    warnings.forEach(w => console.warn(`kit ${id}: ${w}`));
    if (errors.length) return { ok: false, errors };
    const origin = this.origin.get(id);
    let persisted = false;
    if (origin === 'user') {
      try { await this.userSource.put(serializeKit(next)); persisted = true; }
      catch (e) { return { ok: false, errors: ['保存に失敗しました'], cause: e }; }
    } else if (origin === 'base' && this.canAdd) {
      // kits.json は書き換えず、編集できる項目だけを上書きとして保存する（それ以外の項目の変更はメモリだけ）
      const rec = { id, overridesBase: true, ...Object.fromEntries(BASE_EDITABLE.map(k => [k, next[k]])), updatedAt: next.updatedAt };
      try { await this.userSource.put(rec); persisted = true; }
      catch (e) { return { ok: false, errors: ['保存に失敗しました'], cause: e }; }
      this.overrides.set(id, rec);
    }
    this.kits.set(id, Object.freeze(next));
    this.emit('update', next);
    return { ok: true, kit: next, persisted };
  }
  // 削除（ファイル本体の削除は管理画面の削除機能で行う）
  async remove(id) {
    const kit = this.kits.get(id);
    if (!kit) return { ok: false, errors: [`id「${id}」はありません`] };
    if (this.origin.get(id) === 'user') {
      try { await this.userSource.delete(id); }
      catch (e) { return { ok: false, errors: ['削除を保存できませんでした'], cause: e }; }
    }
    this.kits.delete(id); this.origin.delete(id);
    this.emit('remove', kit);
    return { ok: true, kit };
  }
  toJSON() { return { schemaVersion: SCHEMA_VERSION, kits: this.list().map(serializeKit) }; }
}
