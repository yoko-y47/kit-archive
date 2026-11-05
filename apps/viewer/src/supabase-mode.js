// Supabase に保存する単体版：ログインしてから、そのアカウントのアーカイブのユニフォームを読み書きする
// 接続先は環境変数（VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY）。値はコードに書かない（.env.local.example を参照）
// アカウントは Supabase Auth（メールアドレスとパスワード。ML_MyTeam と共通）。ここで新規登録・パスワードの再設定もできる
// ML_MyTeam のクラブを持つ人はクラブのアーカイブ、持たない人は自分のアーカイブ（初回に自動で作る）を使う
import { createClient } from '@supabase/supabase-js';
import { SupabaseKitSource } from 'kit-archive-core';
import { $, showNotice, setStatus } from './ui/util.js';

const MIN_PASSWORD = 6;
const here = () => `${location.origin}${location.pathname}`;   // メールのリンクの戻り先（この単体版）

export function createSupabase(url, key) { return createClient(url, key); }

// メールのリンクから戻ってきたときの結果（# に付く）。createClient より前に読む
export function readAuthLink() {
  const p = new URLSearchParams(location.hash.replace(/^#/, ''));
  const link = { recovery: p.get('type') === 'recovery', error: p.get('error_code') || p.get('error') };
  if (link.error) history.replaceState(null, '', location.pathname + location.search);
  return link;
}

// ログインしていなければログイン画面（ログイン・新規登録・パスワード再設定）を出し、ログインできるまで待つ
// 再設定のリンクから来たときは、新しいパスワードを設定してから進む
export async function ensureSignedIn(client, link) {
  const { data: { session } } = await client.auth.getSession();
  if (session && link.recovery) { history.replaceState(null, '', location.pathname + location.search); await askNewPassword(client); }
  if (session) return session.user;

  const box = $('login'), form = $('loginForm'), submit = $('loginSubmit'), errEl = $('loginError'), noteEl = $('loginNotice');
  let mode = 'signin';
  const setMode = m => {
    mode = m;
    $('loginTitle').innerHTML = { signin: 'ログイン<span>SIGN IN</span>', signup: '新規登録<span>SIGN UP</span>', reset: 'パスワードの再設定<span>RESET</span>' }[m];
    $('loginTabs').hidden = m === 'reset';
    $('loginTabs').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
    $('loginLead').textContent = {
      signin: 'ML_MyTeam のアカウントもそのまま使えます。ユニフォームはアカウントごとのアーカイブに保存されます',
      signup: `メールアドレスとパスワード（${MIN_PASSWORD} 文字以上）で登録します。確認のメールが届いたら、リンクを開いてから使い始めてください`,
      reset: '登録したメールアドレスに、パスワード再設定のリンクを送ります。リンクは一度だけ使え、期限があります'
    }[m];
    $('loginPasswordField').hidden = m === 'reset';
    $('loginConfirmField').hidden = m !== 'signup';
    $('loginPassword').autocomplete = m === 'signup' ? 'new-password' : 'current-password';
    submit.textContent = { signin: 'ログイン', signup: '登録する', reset: '再設定のメールを送る' }[m];
    $('loginForgot').textContent = m === 'reset' ? 'ログインに戻る' : 'パスワードを忘れた場合';
    $('loginForgot').hidden = m === 'signup';
    showNotice(errEl, ''); showNotice(noteEl, '');
  };
  $('loginTabs').addEventListener('click', e => { const m = e.target.closest('button')?.dataset.mode; if (m) setMode(m); });
  $('loginForgot').addEventListener('click', () => setMode(mode === 'reset' ? 'signin' : 'reset'));
  setMode('signin');
  if (link.error) showNotice(errEl, link.error === 'otp_expired'
    ? 'メールのリンクが無効か、期限切れです。もう一度お試しください'
    : `メールのリンクを使えませんでした（${link.error}）`);
  box.hidden = false; $('loginEmail').focus();
  setStatus('ログインしてください');

  return new Promise(resolve => {
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const email = $('loginEmail').value.trim(), password = $('loginPassword').value;
      showNotice(errEl, ''); showNotice(noteEl, '');
      if (!email || (mode !== 'reset' && !password)) { showNotice(errEl, 'メールアドレスとパスワードを入力してください'); return; }
      if (mode === 'signup' && password.length < MIN_PASSWORD) { showNotice(errEl, `パスワードは ${MIN_PASSWORD} 文字以上にしてください`); return; }
      if (mode === 'signup' && password !== $('loginConfirm').value) { showNotice(errEl, '確認用のパスワードが一致しません'); return; }
      const label = submit.textContent;
      submit.disabled = true; submit.textContent = '送信中…';
      try {
        if (mode === 'reset') {
          const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: here() });
          if (error) throw error;
          showNotice(noteEl, '再設定のメールを送りました。メール内のリンクを開いて、新しいパスワードを設定してください');
          return;
        }
        if (mode === 'signup') {
          const { data, error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: here() } });
          if (error) throw error;
          if (!data.session) { showNotice(noteEl, '確認のメールを送りました。メール内のリンクを開くと使い始められます'); return; }
          box.hidden = true; resolve(data.user); return;
        }
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error) { showNotice(errEl, error.status === 400 ? 'メールアドレスかパスワードが違うか、まだメールの確認が済んでいません' : 'ログインできませんでした：' + error.message); return; }
        $('loginPassword').value = '';
        box.hidden = true;
        resolve(data.user);
      } catch (err) {
        console.error(err);
        showNotice(errEl, (mode === 'signup' ? '登録できませんでした：' : 'メールを送れませんでした：') + (err.message || err));
      } finally { submit.disabled = false; submit.textContent = label; }
    });
  });
}

// 再設定のリンクから来たとき：新しいパスワードを入れてもらう（ログイン画面と同じ枠を使う）
function askNewPassword(client) {
  const box = $('login'), form = $('loginForm'), submit = $('loginSubmit'), errEl = $('loginError');
  $('loginTitle').innerHTML = '新しいパスワード<span>NEW PASSWORD</span>';
  $('loginTabs').hidden = true; $('loginForgot').hidden = true; $('loginEmailField').hidden = true;
  $('loginLead').textContent = '再設定のリンクから開きました。新しいパスワードを入れて保存してください';
  $('loginPasswordLabel').textContent = '新しいパスワード'; $('loginPassword').autocomplete = 'new-password';
  $('loginConfirmField').hidden = false;
  submit.textContent = '保存する';
  box.hidden = false; $('loginPassword').focus();
  return new Promise(resolve => {
    const onSubmit = async e => {
      e.preventDefault();
      const password = $('loginPassword').value;
      if (password.length < MIN_PASSWORD) { showNotice(errEl, `${MIN_PASSWORD} 文字以上にしてください`); return; }
      if (password !== $('loginConfirm').value) { showNotice(errEl, '確認用のパスワードが一致しません'); return; }
      submit.disabled = true;
      const { error } = await client.auth.updateUser({ password });
      submit.disabled = false;
      if (error) { showNotice(errEl, '変更できませんでした：' + error.message); return; }
      form.removeEventListener('submit', onSubmit);
      $('loginPassword').value = ''; $('loginConfirm').value = '';
      $('loginEmailField').hidden = false; $('loginPasswordLabel').textContent = 'パスワード';
      box.hidden = true;
      setStatus('パスワードを変更しました');
      resolve();
    };
    form.addEventListener('submit', onSubmit);
  });
}

// ログイン中の人のアーカイブを開く（なければ作る）。開けないときは { reason } を返す（展示は空のまま）
export async function openArchiveSource(client, user) {
  $('account').hidden = false;
  $('accountName').textContent = user.email ?? '';
  $('signOut').addEventListener('click', async () => { await client.auth.signOut(); location.reload(); });
  try {
    const src = await SupabaseKitSource.open(client);
    $('accountName').textContent = `${user.email ?? ''}（${src.archive.name}）`;
    return { src };
  } catch (err) {
    console.error(err);
    const reason = 'アーカイブを開けませんでした：' + (err.message || err);
    setStatus(reason);
    return { reason };
  }
}
