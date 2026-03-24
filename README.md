# CLOUD SYNAPSE — フロントエンド セットアップガイド

## ローカル起動手順

### 1. Node.jsのインストール（まだの場合）
https://nodejs.org から LTS版をインストール

### 2. プロジェクトフォルダを作成
このファイル一式を同じフォルダに置く

### 3. 環境変数ファイルを作成
```bash
cp .env.local.example .env.local
```
`.env.local` を開いて以下を設定：
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` → Google Cloud Consoleで取得
- `NEXTAUTH_SECRET` → ランダムな文字列（何でもOK）
- `NEXT_PUBLIC_GAS_API_URL` → GASデプロイ後のURL

### 4. 依存パッケージをインストール
```bash
npm install
```

### 5. 開発サーバーを起動
```bash
npm run dev
```
→ http://localhost:3000 で確認

---

## Google Cloud Console での設定

1. https://console.cloud.google.com にアクセス
2. 新しいプロジェクトを作成（または既存を選択）
3. 左メニュー「APIとサービス」→「認証情報」
4. 「認証情報を作成」→「OAuthクライアントID」
5. アプリの種類：「ウェブアプリケーション」
6. 承認済みのJavaScript生成元：
   - `http://localhost:3000`（開発用）
   - `https://あなたのVercelドメイン`（本番用）
7. 承認済みのリダイレクトURI：
   - `http://localhost:3000/api/auth/callback/google`
   - `https://あなたのVercelドメイン/api/auth/callback/google`
8. クライアントIDとシークレットをコピー → .env.local に貼り付け

---

## Vercelへのデプロイ

### 方法A：Vercel CLI（コマンドラインから）
```bash
npm install -g vercel
vercel
```
画面の指示に従うだけで自動デプロイされます。

### 方法B：GitHub連携（推奨）
1. GitHubにリポジトリを作成してコードをpush
2. https://vercel.com でログイン
3. 「New Project」→ GitHubのリポジトリを選択
4. 「Environment Variables」で.env.localの内容を登録
   - GOOGLE_CLIENT_ID
   - GOOGLE_CLIENT_SECRET
   - NEXTAUTH_SECRET
   - NEXTAUTH_URL（VercelのURL、例: https://cloud-synapse.vercel.app）
   - NEXT_PUBLIC_GAS_API_URL
5. 「Deploy」をクリック

---

## ファイル構成

```
nextapp/
├── app/
│   ├── layout.tsx          # 全ページ共通レイアウト
│   ├── page.tsx            # / → ログイン状態でリダイレクト
│   ├── globals.css         # 全体スタイル
│   ├── login/
│   │   └── page.tsx        # ★ サインアップ/ログイン画面
│   ├── dashboard/
│   │   └── page.tsx        # ダッシュボード（次に作る）
│   └── api/auth/[...nextauth]/
│       └── route.ts        # NextAuth設定
├── lib/
│   └── api.ts              # GAS APIクライアント
├── types/
│   └── next-auth.d.ts      # 型定義
├── .env.local.example      # 環境変数テンプレート
├── package.json
├── tsconfig.json
└── next.config.js
```
