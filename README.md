# Sales Automation System

営業リスト自動営業システム - Google Sheetsからの営業リスト表示システム

## 概要

Google Sheetsに保存された営業リストを自動取得し、見やすいテーブル形式で表示するNext.jsアプリケーションです。Google Sheets APIを使用してリアルタイムでデータを取得・表示します。

## 現在の機能

- 📊 Google Sheetsからの営業リスト自動取得
- 📋 レスポンシブなテーブル表示
- 🔄 リアルタイムデータ更新
- 📱 モバイル対応UI
- ⭐ 評価・レビュー数の視覚的表示

## 技術スタック

- **Frontend**: Next.js 15 + TypeScript
- **Styling**: Tailwind CSS
- **API**: Google Sheets API
- **Authentication**: Service Account認証

## データ構造

Google Sheetsの列構成:
- 企業名
- 住所
- 電話番号
- ウェブサイト
- メール
- 評価
- レビュー数
- カテゴリ
- 検索条件
- 地域
- 取得日時

## セットアップ

### 1. プロジェクトのクローン

```bash
git clone https://github.com/Valientech-official/sales-automation-system.git
cd sales-automation-system
```

### 2. 依存関係のインストール

```bash
npm install
```

### 3. 環境変数の設定

`.env.local` ファイルを作成し、以下を設定:

```env
GOOGLE_SHEETS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----..."
GOOGLE_SHEETS_SHEET_ID=your_sheet_id
GOOGLE_SHEETS_CLIENT_EMAIL=your_service_account@domain.iam.gserviceaccount.com
GEMINI_API_KEY=your_gemini_api_key
```

### 4. 開発サーバーの起動

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000) でアプリケーションが起動します。

## Google Sheets API設定

1. Google Cloud Consoleでプロジェクトを作成
2. Google Sheets APIを有効化
3. サービスアカウントを作成し、JSONキーをダウンロード
4. スプレッドシートをサービスアカウントと共有

## API エンドポイント

### GET `/api/sales-data`

Google Sheetsから営業リストデータを取得

**レスポンス:**
```json
{
  "success": true,
  "data": [...],
  "total": 123
}
```

## デプロイ

### Vercel (推奨)

```bash
vercel --prod
```

環境変数も併せてVercelダッシュボードで設定してください。

## ライセンス

MIT License

## 開発者

Valientech Official Team
