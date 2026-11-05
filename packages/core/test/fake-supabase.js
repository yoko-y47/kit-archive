// テスト用の Supabase クライアントの代わり（メモリ上だけで動く。本物の Supabase には接続しない）
// SupabaseKitSource と単体版のログイン画面が使う範囲だけを真似る：
//   auth.getSession / getUser / signInWithPassword / signOut / onAuthStateChange
//   from(table).select(列).eq().order().limit().maybeSingle() / upsert(行) / delete().eq()
//   storage.from(bucket).upload / remove / createSignedUrl
// RLS の代わりに、ログイン中の人が所有するクラブの行だけを読み書きできるようにする
const clone = v => JSON.parse(JSON.stringify(v));
const uuid = () => crypto.randomUUID();

export function createFakeSupabase({ users = [], clubs = [], uniforms = [], kits = [], persistKey = null } = {}) {
  const db = { clubs: clone(clubs), uniforms: clone(uniforms), kits: clone(kits) };
  const files = new Map();   // バケット/パス → Blob
  const listeners = new Set();
  let session = null;
  const store = typeof localStorage !== 'undefined' && persistKey ? localStorage : null;
  try { if (store) session = JSON.parse(store.getItem(persistKey) || 'null'); } catch { session = null; }
  const setSession = s => { session = s; try { store?.[s ? 'setItem' : 'removeItem'](persistKey, JSON.stringify(s)); } catch { /* 保存できなくても続ける */ } listeners.forEach(fn => fn(s ? 'SIGNED_IN' : 'SIGNED_OUT', s)); };
  const me = () => session?.user ?? null;
  const ownClubIds = () => db.clubs.filter(c => c.owner_id === me()?.id).map(c => c.id);
  const err = (message, code) => ({ data: null, error: { message, code } });

  function query(table) {
    let filters = [], single = false, op = 'select', payload = null, limit = Infinity, cols = '*';
    const rows = () => {
      let r = db[table];
      if (table === 'kits') r = r.filter(k => ownClubIds().includes(k.club_id));   // RLS の代わり
      return r.filter(row => filters.every(([c, v]) => row[c] === v));
    };
    const run = () => {
      if (op === 'select') {
        let out = rows().slice(0, limit).map(clone);
        if (table === 'kits' && cols.includes('legacy_uniform:')) out = out.map(k => ({ ...k, legacy_uniform: k.legacy_uniform_id ? { image_url: db.uniforms.find(u => u.id === k.legacy_uniform_id)?.image_url ?? null } : null }));
        if (single) return { data: out[0] ?? null, error: null };
        return { data: out, error: null };
      }
      if (op === 'upsert') {
        if (!me()) return err('not signed in', '42501');
        if (!ownClubIds().includes(payload.club_id)) return err('new row violates row-level security policy', '42501');
        if ((payload.season_label == null) !== (payload.season_start_year == null)) return err('violates check constraint', '23514');
        const i = db.kits.findIndex(k => k.id === payload.id);
        if (i >= 0) db.kits[i] = { ...db.kits[i], ...clone(payload) };
        else db.kits.push({ id: uuid(), created_by: me().id, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), season_id: null, legacy_uniform_id: null, ...clone(payload) });
        return { data: null, error: null };
      }
      if (op === 'delete') {
        const del = new Set(rows().map(r => r.id));
        db[table] = db[table].filter(r => !del.has(r.id));
        return { data: null, error: null };
      }
    };
    const b = {
      select(c = '*') { cols = c; return b; },
      eq(c, v) { filters.push([c, v]); return b; },
      order() { return b; },
      limit(n) { limit = n; return b; },
      maybeSingle() { single = true; return b; },
      upsert(row) { op = 'upsert'; payload = row; return b; },
      delete() { op = 'delete'; return b; },
      then(ok, ng) { return Promise.resolve().then(run).then(ok, ng); }
    };
    return b;
  }

  const client = {
    auth: {
      async getSession() { return { data: { session }, error: null }; },
      async getUser() { return me() ? { data: { user: me() }, error: null } : { data: { user: null }, error: { message: 'Auth session missing!' } }; },
      async signInWithPassword({ email, password }) {
        const u = users.find(x => x.email === email && x.password === password);
        if (!u) return { data: { user: null, session: null }, error: { message: 'Invalid login credentials', status: 400 } };
        setSession({ access_token: 'fake', user: { id: u.id, email: u.email } });
        return { data: { user: session.user, session }, error: null };
      },
      async signOut() { setSession(null); return { error: null }; },
      onAuthStateChange(fn) { listeners.add(fn); return { data: { subscription: { unsubscribe: () => listeners.delete(fn) } } }; }
    },
    from: query,
    storage: {
      from(bucket) {
        return {
          async upload(path, blob) {
            if (!me()) return err('not signed in');
            if (!ownClubIds().includes(path.split('/')[0])) return err('new row violates row-level security policy');
            files.set(bucket + '/' + path, blob); return { data: { path }, error: null };
          },
          async remove(paths) { paths.forEach(p => files.delete(bucket + '/' + p)); return { data: [], error: null }; },
          async createSignedUrl(path) {
            const blob = files.get(bucket + '/' + path);
            if (!blob) return err('Object not found');
            const url = typeof URL.createObjectURL === 'function' && typeof Blob !== 'undefined' && blob instanceof Blob ? URL.createObjectURL(blob) : 'fake://' + bucket + '/' + path;
            return { data: { signedUrl: url }, error: null };
          }
        };
      }
    },
    _db: db, _files: files
  };
  return client;
}
