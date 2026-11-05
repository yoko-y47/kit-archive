// Supabase の保存先（kit-data.js の source と同じ形）。単体版と ML_MyTeam 統合版が同じデータを使う
// テーブル public.kit_archives / public.kits と非公開バケット kit-textures（設計：docs/supabase/README.md）
// - Supabase のクライアントは使う側が作って渡す（接続情報・ログインはアプリ側。core は @supabase/supabase-js に依存しない）
// - キットは「アーカイブ」（1人が持つキットのまとまり）に属する。ML_MyTeam のクラブのアーカイブは club_id でクラブとひも付く
// - 読み書きできるのは、ログインしている人が持つアーカイブのデータだけ（Supabase の RLS で制限される）
// - キット画像は「sb:<バケット内のパス>」という参照（display.texture）でデータから指す。表示は署名付き URL
import { normalizeCategory } from '../kit-data.js';

export const KIT_TABLE = 'kits';
export const ARCHIVE_TABLE = 'kit_archives';
export const DEFAULT_ARCHIVE_NAME = 'マイアーカイブ';
export const TEXTURE_BUCKET = 'kit-textures';
const SIGNED_URL_SECONDS = 60 * 60;

// 3D の型紙（model_key）と、アプリに同梱する GLB の対応。参照先はアプリの resolveModelUrls が読み替える
export const MODEL_KEYS = Object.freeze({ standard: { hanging: 'models/kit_hanging.glb', worn: 'models/kit_base.glb' } });
const modelKeyOf = url => {
  const name = String(url ?? '').split('/').pop();
  return Object.keys(MODEL_KEYS).find(k => MODEL_KEYS[k].hanging.endsWith('/' + name)) ?? 'standard';
};

// kits の1行 → core のデータ（normalizeKit に渡す形）
export function rowToKit(row) {
  const model = MODEL_KEYS[row.model_key] ?? MODEL_KEYS.standard;
  return {
    id: row.id,
    season: row.season_label, seasonStartYear: row.season_start_year,
    name: row.name, type: normalizeCategory(row.kit_type),
    variant: row.variant, variantOrder: row.variant_order, sortHint: row.sort_hint,
    modelUrl: model.hanging, modelUrlWorn: model.worn,
    thumbnailUrl: row.legacy_uniform?.image_url ?? null,
    hanger: { visible: row.hanger_visible !== false },
    display: { collar: row.collar, color: row.display_color, texture: row.texture_path ? 'sb:' + row.texture_path : null, scale: Number(row.display_scale ?? 1) },
    placeholder: row.is_placeholder === true,
    createdAt: row.created_at, updatedAt: row.updated_at,
    seasonId: row.season_id ?? null, legacyUniformId: row.legacy_uniform_id ?? null
  };
}
// core のデータ → kits の1行（archive_id / club_id は保存先のアーカイブから入れる。id がない行は Supabase が作る）
// クラブにひも付かないアーカイブでは、ML_MyTeam のシーズン・2D 画像へのひも付けは使えない（空にする）
export function kitToRow(kit, archive) {
  const clubId = archive.club_id ?? null;
  const tex = kit.display?.texture;
  const row = {
    archive_id: archive.id,
    club_id: clubId,
    season_label: kit.season ?? null, season_start_year: kit.season == null ? null : kit.seasonStartYear ?? null,
    kit_type: kit.type ? String(kit.type).toLowerCase() : null,
    variant: kit.variant ?? null, variant_order: kit.variantOrder ?? 0, sort_hint: kit.sortHint ?? 0,
    name: kit.name,
    model_key: modelKeyOf(kit.modelUrl),
    texture_path: typeof tex === 'string' && tex.startsWith('sb:') ? tex.slice(3) : null,
    collar: kit.display?.collar ?? null, display_color: kit.display?.color ?? null, display_scale: kit.display?.scale ?? 1,
    hanger_visible: kit.hanger?.visible !== false,
    is_placeholder: kit.placeholder === true
  };
  if (kit.id) row.id = kit.id;
  if (kit.seasonId !== undefined) row.season_id = clubId ? kit.seasonId : null;
  if (kit.legacyUniformId !== undefined) row.legacy_uniform_id = clubId ? kit.legacyUniformId : null;
  if (kit.createdAt) row.created_at = kit.createdAt;
  if (kit.updatedAt) row.updated_at = kit.updatedAt;
  return row;
}

const uuid = () => crypto.randomUUID();

export class SupabaseKitSource {
  constructor(client, archive) {
    this.client = client; this.archive = archive;
    this.archiveId = archive.id; this.clubId = archive.club_id ?? null;
    this.name = 'supabase'; this.writable = true;
    this.label = `Supabase（${archive.name}）`;
    this.signed = new Map();   // sb:<path> → { url, expires }
  }
  // ログイン中の人のアーカイブを開く（なければ作る）
  // - clubId を渡したとき（ML_MyTeam）：そのクラブのアーカイブ
  // - 渡さないとき（単体版）：クラブのアーカイブがあればそれ、なければ自分のアーカイブ。どちらもなければ、
  //   クラブを持っていればそのクラブの、持っていなければ「マイアーカイブ」を作る
  static async open(client, { clubId } = {}) {
    const { data: { user }, error: uerr } = await client.auth.getUser();
    if (uerr || !user) throw Object.assign(new Error('ログインしていません'), { code: 'not_signed_in' });
    const pick = async query => { const { data, error } = await query; if (error) throw error; return data; };
    let archive;
    if (clubId) {
      archive = await pick(client.from(ARCHIVE_TABLE).select('*').eq('club_id', clubId).maybeSingle());
      if (!archive) {
        const club = await pick(client.from('clubs').select('id, name').eq('id', clubId).maybeSingle());
        if (!club) throw Object.assign(new Error('クラブが見つかりません'), { code: 'no_club' });
        archive = await pick(client.from(ARCHIVE_TABLE).insert({ name: club.name, club_id: club.id }).select().single());
      }
    } else {
      const archives = await pick(client.from(ARCHIVE_TABLE).select('*').eq('owner_id', user.id).order('created_at'));
      archive = archives.find(a => a.club_id) ?? archives[0];
      if (!archive) {
        const club = await pick(client.from('clubs').select('id, name').eq('owner_id', user.id).order('created_at').limit(1).maybeSingle());
        archive = await pick(client.from(ARCHIVE_TABLE).insert(club ? { name: club.name, club_id: club.id } : { name: DEFAULT_ARCHIVE_NAME }).select().single());
      }
    }
    return new SupabaseKitSource(client, archive);
  }
  // アーカイブの名前を変える（クラブにひも付かないアーカイブ用）
  async rename(name) {
    const { error } = await this.client.from(ARCHIVE_TABLE).update({ name }).eq('id', this.archiveId);
    if (error) throw error;
    this.archive = { ...this.archive, name }; this.label = `Supabase（${name}）`;
  }
  // 新しいユニフォームの id（kits.id は uuid）
  newId() { return uuid(); }
  async load() {
    const { data, error } = await this.client.from(KIT_TABLE)
      .select('*, legacy_uniform:uniforms!legacy_uniform_id(image_url)')
      .eq('archive_id', this.archiveId);
    if (error) throw error;
    return data.map(rowToKit);
  }
  async put(kit) {
    const { error } = await this.client.from(KIT_TABLE).upsert(kitToRow(kit, this.archive));
    if (error) throw error;
  }
  async delete(id) {
    const { error } = await this.client.from(KIT_TABLE).delete().eq('id', id);
    if (error) throw error;
  }
  // キット画像を保存し、データから指す参照（sb:<path>）を返す。GLB は同梱の型紙を使うので保存しない
  async putFile(blob, kind) {
    if (kind === 'model') throw Object.assign(new Error('Supabase には GLB を保存しません（型紙を使います）'), { code: 'unsupported_type' });
    const path = `${this.archiveId}/${uuid()}.png`;
    const { error } = await this.client.storage.from(TEXTURE_BUCKET).upload(path, blob, { contentType: blob.type || 'image/png', upsert: false });
    if (error) throw error;
    return 'sb:' + path;
  }
  async deleteFile(url) {
    const { error } = await this.client.storage.from(TEXTURE_BUCKET).remove([url.slice(3)]);
    if (error) throw error;
  }
  async readModel(url) { throw new Error('Supabase に GLB はありません: ' + url); }
  // 表示用の署名付き URL（1時間有効。切れる5分前までは使い回す）
  async imageUrl(url) {
    const hit = this.signed.get(url);
    if (hit && hit.expires - Date.now() > 5 * 60 * 1000) return hit.url;
    const { data, error } = await this.client.storage.from(TEXTURE_BUCKET).createSignedUrl(url.slice(3), SIGNED_URL_SECONDS);
    if (error) throw error;
    this.signed.set(url, { url: data.signedUrl, expires: Date.now() + SIGNED_URL_SECONDS * 1000 });
    return data.signedUrl;
  }
}
