// Supabase に保存する単体版：ログインしてから、そのアカウントのクラブのユニフォームを読み書きする
// 接続先は環境変数（VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY）。値はコードに書かない（.env.local.example を参照）
// ログインは ML_MyTeam と同じ Supabase Auth（メールアドレスとパスワード）。アカウントの作成は ML_MyTeam で行う
import { createClient } from '@supabase/supabase-js';
import { SupabaseKitSource } from 'kit-archive-core';
import { $, showNotice, setStatus } from './ui/util.js';

export function createSupabase(url, key) { return createClient(url, key); }

// ログインしていなければログイン画面を出し、ログインできるまで待つ
export async function ensureSignedIn(client) {
  const { data: { session } } = await client.auth.getSession();
  if (session) return session.user;
  const box = $('login'), form = $('loginForm'), submit = $('loginSubmit'), errEl = $('loginError');
  box.hidden = false; $('loginEmail').focus();
  setStatus('ログインしてください');
  return new Promise(resolve => {
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const email = $('loginEmail').value.trim(), password = $('loginPassword').value;
      if (!email || !password) { showNotice(errEl, 'メールアドレスとパスワードを入力してください'); return; }
      submit.disabled = true; submit.textContent = 'ログイン中…'; showNotice(errEl, '');
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      submit.disabled = false; submit.textContent = 'ログイン';
      if (error) { showNotice(errEl, error.status === 400 ? 'メールアドレスかパスワードが違います' : 'ログインできませんでした：' + error.message); return; }
      $('loginPassword').value = '';
      box.hidden = true;
      resolve(data.user);
    });
  });
}

// ログイン中のクラブの保存先を開く。開けないときは { reason } を返す（展示は空のまま）
export async function openClubSource(client, user) {
  $('account').hidden = false;
  $('accountName').textContent = user.email ?? '';
  $('signOut').addEventListener('click', async () => { await client.auth.signOut(); location.reload(); });
  try {
    const src = await SupabaseKitSource.open(client);
    $('accountName').textContent = `${user.email ?? ''}（${src.club.name}）`;
    return { src };
  } catch (err) {
    (err.code === 'no_club' ? console.warn : console.error)(err);
    const reason = err.code === 'no_club'
      ? 'このアカウントにはクラブがありません。ML_MyTeam でクラブを作ってから開き直してください'
      : 'クラブの情報を読み込めませんでした：' + (err.message || err);
    setStatus(reason);
    return { reason };
  }
}
