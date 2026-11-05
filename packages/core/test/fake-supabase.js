// テスト用の Supabase クライアントの代わり（メモリ上だけで動く。本物の Supabase には接続しない）
// SupabaseKitSource と単体版のログイン画面が使う範囲だけを真似る：
//   auth.getSession / getUser / signInWithPassword / signUp / signOut / resetPasswordForEmail / updateUser / onAuthStateChange
//   from(table).select(列).eq().order().limit().maybeSingle().single() / insert(行).select() / update(値).eq() / upsert(行) / delete().eq()
//   storage.from(bucket).upload / remove / createSignedUrl
// RLS の代わりに、ログイン中の人が持つアーカイブ（とクラブ）の行だけを読み書きできるようにする（migration 20261106000000_kit_archives.sql と同じ規則）
const clone = v => JSON.parse(JSON.stringify(v));
const uuid = () => crypto.randomUUID();

export function createFakeSupabase({ users = [], clubs = [], uniforms = [], kits = [], archives = [], persistKey = null, confirmEmail = false } = {}) {
  users = clone(users);
  const db = { clubs: clone(clubs), uniforms: clone(uniforms), kits: clone(kits), kit_archives: clone(archives) };
  const files = new Map();   // バケット/パス → Blob
  const listeners = new Set();
  const sent = [];           // 送ったメール（確認用）
  let session = null;
  const store = typeof localStorage !== 'undefined' && persistKey ? localStorage : null;
  try { if (store) session = JSON.parse(store.getItem(persistKey) || 'null'); } catch { session = null; }
  const setSession = s => { session = s; try { store?.[s ? 'setItem' : 'removeItem'](persistKey, JSON.stringify(s)); } catch { /* 保存できなくても続ける */ } listeners.forEach(fn => fn(s ? 'SIGNED_IN' : 'SIGNED_OUT', s)); };
  const me = () => session?.user ?? null;
  const ownClubIds = () => db.clubs.filter(c => c.owner_id === me()?.id).map(c => c.id);
  const ownArchives = () => db.kit_archives.filter(a => a.owner_id === me()?.id);
  const ownArchiveIds = () => ownArchives().map(a => a.id);
  const err = (message, code) => ({ data: null, error: { message, code } });
  const visible = (table, r) => {   // RLS の代わり（読む）
    if (table === 'kits') return r.filter(k => ownArchiveIds().includes(k.archive_id));
    if (table === 'kit_archives') return r.filter(a => a.owner_id === me()?.id);
    if (table === 'clubs') return r.filter(c => c.owner_id === me()?.id);
    if (table === 'uniforms') return r.filter(u => ownClubIds().includes(u.club_id));
    return r;
  };
  // RLS の with check と上限の代わり（書く）。だめなら理由、よければ null
  function checkWrite(table, row, isInsert) {
    if (!me()) return 'not signed in';
    if (table === 'kit_archives') {
      if (row.owner_id !== me().id) return 'new row violates row-level security policy';
      if (row.club_id && !ownClubIds().includes(row.club_id)) return 'new row violates row-level security policy';
      if (isInsert && !row.club_id && db.kit_archives.some(a => a.owner_id === row.owner_id && !a.club_id)) return 'kit_archives: personal archive limit reached (1 per user)';
      if (isInsert && row.club_id && db.kit_archives.some(a => a.club_id === row.club_id)) return 'duplicate key value violates unique constraint';
      return null;
    }
    if (table === 'kits') {
      const a = db.kit_archives.find(x => x.id === row.archive_id);
      if (!a || a.owner_id !== me().id) return 'new row violates row-level security policy';
      if ((row.club_id ?? null) !== (a.club_id ?? null)) return 'new row violates row-level security policy';
      if (row.season_id && !row.club_id) return 'new row violates row-level security policy';   // シーズンはクラブのアーカイブだけ
      if (row.legacy_uniform_id && !db.uniforms.some(u => u.id === row.legacy_uniform_id && u.club_id === row.club_id)) return 'new row violates row-level security policy';
      if ((row.season_label == null) !== (row.season_start_year == null)) return 'violates check constraint';
      if (isInsert && db.kits.filter(k => k.archive_id === row.archive_id).length >= 200) return 'kits: limit reached (200 per archive)';
      return null;
    }
    return 'not allowed';
  }

  function query(table) {
    let filters = [], single = false, op = 'select', payload = null, limit = Infinity, cols = '*', returning = false;
    const rows = () => visible(table, db[table]).filter(row => filters.every(([c, v]) => row[c] === v));
    const result = out => single ? (out.length ? { data: out[0], error: null } : (single === 'strict' ? err('no rows') : { data: null, error: null })) : { data: out, error: null };
    const run = () => {
      if (op === 'select') {
        let out = rows().slice(0, limit).map(clone);
        if (table === 'kits' && cols.includes('legacy_uniform:')) out = out.map(k => ({ ...k, legacy_uniform: k.legacy_uniform_id ? { image_url: db.uniforms.find(u => u.id === k.legacy_uniform_id)?.image_url ?? null } : null }));
        return result(out);
      }
      if (op === 'insert') {
        const now = new Date().toISOString();
        const row = { id: uuid(), created_at: now, ...(table === 'kit_archives' ? { owner_id: me()?.id, club_id: null } : {}), ...clone(payload) };
        const why = checkWrite(table, row, true); if (why) return err(why, '42501');
        db[table].push(row);
        return returning ? result([clone(row)]) : { data: null, error: null };
      }
      if (op === 'update') {
        for (const r of rows()) { const next = { ...r, ...clone(payload) }; const why = checkWrite(table, next, false); if (why) return err(why, '42501'); Object.assign(r, next); }
        return { data: null, error: null };
      }
      if (op === 'upsert') {
        const i = db[table].findIndex(k => k.id === payload.id);
        const now = new Date().toISOString();
        const next = i >= 0 ? { ...db[table][i], ...clone(payload) } : { id: uuid(), created_by: me()?.id, created_at: now, updated_at: now, season_id: null, legacy_uniform_id: null, ...clone(payload) };
        if (i >= 0 && !visible(table, [db[table][i]]).length) return err('new row violates row-level security policy', '42501');
        const why = checkWrite(table, next, i < 0); if (why) return err(why, '42501');
        if (i >= 0) db[table][i] = next; else db[table].push(next);
        return { data: null, error: null };
      }
      if (op === 'delete') {
        const del = new Set(rows().map(r => r.id));
        db[table] = db[table].filter(r => !del.has(r.id));
        return { data: null, error: null };
      }
    };
    const b = {
      select(c = '*') { cols = c; if (op === 'insert') returning = true; return b; },
      eq(c, v) { filters.push([c, v]); return b; },
      order() { return b; },
      limit(n) { limit = n; return b; },
      maybeSingle() { single = true; return b; },
      single() { single = 'strict'; return b; },
      insert(row) { op = 'insert'; payload = row; return b; },
      update(v) { op = 'update'; payload = v; return b; },
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
        const u = users.find(x => x.email === email && x.password === password && x.confirmed !== false);
        if (!u) return { data: { user: null, session: null }, error: { message: 'Invalid login credentials', status: 400 } };
        setSession({ access_token: 'fake', user: { id: u.id, email: u.email } });
        return { data: { user: session.user, session }, error: null };
      },
      async signUp({ email, password }) {
        if (users.some(x => x.email === email)) return { data: { user: null, session: null }, error: { message: 'User already registered', status: 422 } };
        if (!password || password.length < 6) return { data: { user: null, session: null }, error: { message: 'Password should be at least 6 characters.', status: 422 } };
        const u = { id: uuid(), email, password, confirmed: !confirmEmail };
        users.push(u);
        if (confirmEmail) { sent.push({ to: email, kind: 'confirm' }); return { data: { user: { id: u.id, email }, session: null }, error: null }; }
        setSession({ access_token: 'fake', user: { id: u.id, email } });
        return { data: { user: session.user, session }, error: null };
      },
      async resetPasswordForEmail(email) { sent.push({ to: email, kind: 'recovery' }); return { data: {}, error: null }; },
      async updateUser({ password }) {
        if (!me()) return { data: { user: null }, error: { message: 'Auth session missing!' } };
        users.find(x => x.id === me().id).password = password;
        return { data: { user: me() }, error: null };
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
            if (!ownArchiveIds().includes(path.split('/')[0])) return err('new row violates row-level security policy');
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
    _db: db, _files: files, _sent: sent, _users: users
  };
  return client;
}
