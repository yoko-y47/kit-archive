# 新規登録・パスワード再設定のメールを届くようにする（Supabase の設定）

単体版（https://yoko-y47.github.io/kit-archive/ ）で、ML_MyTeam を使っていない人も新規登録できるようにするための設定。
どれも Supabase・メール送信サービスのアカウントの設定なので、持ち主（ユーザー）が行う。接続情報・パスワードはコードやこのリポジトリに書かない。

## 1. メールの送り元（外部の SMTP）
Supabase の標準のメール送信は、送れる相手（プロジェクトのメンバーだけ）や通数（1 時間に数通）に強い制限がある（2024 年以降の Supabase の方針。正確な値は Supabase の Auth の SMTP のページで確認）。
他の人に確認メールを届けるには、外部のメール送信サービスを Supabase に設定する。独自ドメインを持っていない前提での候補：

| サービス | 独自ドメイン | 無料で送れる量（目安） | 注意 |
|---|---|---|---|
| Brevo（旧 Sendinblue） | 不要（送り元のメールアドレスを確認するだけ） | 1 日 300 通 | 送り元に使うメールアドレスの確認が必要 |
| Gmail の SMTP | 不要 | 1 日 500 通前後 | Google アカウントで 2 段階認証を有効にし「アプリ パスワード」を作る。送り元は自分の Gmail アドレスになる |
| Resend | 必要（ドメインなしでは自分宛てにしか送れない） | 1 日 100 通 | 独自ドメインを持っているなら有力 |

数値・条件は各サービスの料金ページで確認すること（変わることがある）。

### Supabase への設定（ダッシュボード）
Authentication → Emails（または Settings → Auth）→ **SMTP Settings** で「Enable custom SMTP」をオンにして入力する：
- Sender email：送り元のメールアドレス（Brevo で確認したもの／自分の Gmail）
- Sender name：例「Kit Archive」
- Host / Port：Brevo は `smtp-relay.brevo.com` / `587`、Gmail は `smtp.gmail.com` / `587`
- Username / Password：Brevo は SMTP キーのページに出るログインとキー、Gmail は Gmail アドレスとアプリ パスワード

設定後、Authentication → Rate Limits で、メールの送信上限（1 時間あたり）を必要に応じて上げる。

## 2. メールのリンクの戻り先（URL Configuration）
Authentication → **URL Configuration**：
- Site URL：`https://yoko-y47.github.io/master-league-club/`
- Redirect URLs に追加：
  - `https://yoko-y47.github.io/master-league-club/**`
  - `https://yoko-y47.github.io/kit-archive/**`
  - `http://localhost:5173/**`（手元で開発するとき）

単体版は新規登録・再設定のメールで、戻り先を単体版のページ（`emailRedirectTo` / `redirectTo`）にする。Redirect URLs にないと Site URL に戻ってしまう。

## 3. 新規登録を受け付ける設定
Authentication → Providers（または Sign In / Up）→ Email：
- 「Allow new users to sign up」がオン（ML_MyTeam の新規登録と共通）
- 「Confirm email」はオンのまま（確認メールのリンクを開くまでログインできない）

## 4. 知っておくこと
- 単体版で登録した人も、ML_MyTeam の公開サイトに同じアカウントでログインできる（アカウントは共通）。その場合はクラブ作成の画面になる（ML_MyTeam のデータは、クラブを作るまで何もない）
- 他の人のアーカイブ・キット画像は、データベースの権限（RLS）で持ち主しか見られない。持ち主のあなたは Supabase のダッシュボードから中身を見られる
- 無料プランの容量（データベース・ストレージ）を全員で使う。上限：自分のアーカイブ 1 人 1 つ、キット 1 アーカイブ 200 着、画像 1 枚 16MB
