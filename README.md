# 営業リスト自動化システム (Sales Automation System)

Next.jsベースの企業情報自動収集・検証システム。求人情報から企業の連絡先を収集し、複数のAPIで検証してGoogle Sheetsに保存します。

## 機能概要

- **求人データ取得**: DataForSEO Jobs APIから最新求人情報を収集
- **企業情報抽出**: SERP検索とページ解析で企業の詳細情報を取得
- **多段階検証**: Brave Search APIとAIを使用した信頼性検証
- **電話番号検証**: 専用サービスによる電話番号の真正性確認
- **絶対重複チェック**: メモリキャッシュによる完全な重複防止
- **自動保存**: 高信頼度データのみGoogle Sheetsに自動保存
- **Cronスケジューリング**: 30分間隔での自動実行
- **レスポンシブUI**: 収集されたデータの見やすいテーブル表示

## システム構成

```
src/
├── app/api/cron/sales-automation/
│   └── route.ts                    # Cron APIエンドポイント
└── lib/
    ├── services/
    │   ├── dataForSeoService.ts     # DataForSEO API統合
    │   ├── braveSearchTool.ts       # Brave Search API統合
    │   ├── companyVerificationService.ts  # Gemini AI企業検証
    │   ├── phoneVerificationService.ts    # 電話番号検証
    │   ├── simpleDuplicateCheck.ts        # 重複チェック
    │   └── enhancedSalesAutomation.ts     # メインオーケストレーション
    └── googleSheets.ts              # Google Sheets統合
```

## API統合

### DataForSEO
- **Jobs API**: 求人データ収集
- **SERP Search**: Google検索結果取得
- **OnPage Content Parsing**: ページ内容解析

### Brave Search API
- **企業存在確認**: 複数ソースでの企業検証
- **電話番号検証**: 企業と電話番号の関連性確認
- **ビジネスリスティング**: 公的データベースでの確認

### Google Gemini 2.5 Flash
- **Function Calling**: 構造化されたAPI呼び出し調整
- **情報統合**: 複数ソースからの情報統合
- **信頼性スコア算出**: AI駆動の品質評価

## 技術スタック

- **Frontend**: Next.js 15 + TypeScript
- **Styling**: Tailwind CSS
- **APIs**: DataForSEO, Brave Search, Google Gemini 2.5 Flash
- **Data Storage**: Google Sheets API
- **Authentication**: Service Account認証

## セットアップ

### 1. 環境変数設定

`.env.local`ファイルを作成し、以下の値を設定してください：

```env
# Google Sheets API
GOOGLE_SHEETS_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_SHEETS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_SHEETS_SHEET_ID=your_sheet_id

# Google Gemini API
GEMINI_API_KEY=your_gemini_api_key

# DataForSEO API
DATAFORSEO_USERNAME=your_dataforseo_username
DATAFORSEO_PASSWORD=your_dataforseo_password

# Brave Search API
BRAVE_API_KEY=your_brave_api_key
```

### 2. 依存関係インストール

```bash
npm install
```

### 3. Google Sheets設定

1. Google Cloud Consoleでサービスアカウントを作成
2. Sheets APIを有効化
3. サービスアカウントキーをダウンロード
4. Google Sheetsでサービスアカウントに編集権限を付与

### 4. 開発サーバー起動

```bash
npm run dev
```

## 使用方法

### 手動実行

**テストモード（3社まで）:**
```bash
curl "http://localhost:3000/api/cron/sales-automation?test=true"
```

**本番モード:**
```bash
curl "http://localhost:3000/api/cron/sales-automation"
```

**POSTでの手動トリガー:**
```bash
curl -X POST http://localhost:3000/api/cron/sales-automation \
  -H "Content-Type: application/json" \
  -d '{
    "testMode": true,
    "maxCompanies": 5,
    "refreshCache": true
  }'
```

### 自動実行

Vercel Cronまたは外部Cronサービスで以下のエンドポイントを30分間隔で実行：

```
GET /api/cron/sales-automation
```

## データフロー

```
1. DataForSEO Jobs API → 求人データ取得
2. 重複チェック → 既存データとの照合
3. 企業情報収集 → SERP検索・ページ解析
4. Brave Search検証 → 企業存在確認
5. 電話番号検証 → 複数パターンでの検証
6. AI信頼性判定 → Gemini AIによる総合評価
7. 高品質データ保存 → Google Sheetsに自動保存
```

## 信頼性基準

### 信頼度スコア（0-100%）
- **企業存在確認**: 40点
- **公式サイト発見**: 20点  
- **電話番号検証**: 25点
- **連絡先情報抽出**: 10点
- **複数ソース確認**: 5点

**保存条件**: 信頼度60%以上のデータのみ

### 電話番号検証
- **フォーマット検証**: 日本の電話番号パターン
- **企業関連付け**: 企業名と電話番号の共起確認  
- **ビジネスリスティング**: 公的サイトでの確認
- **複数ソース**: 複数の検索結果での裏付け

## モニタリング

### システム状態確認
```javascript
const status = await automation.getSystemStatus();
// cacheStats, sheetsConnection, apiConnections
```

### 実行ログ
全ての処理はコンソールに詳細ログを出力：
- 📊 処理統計
- ✅ 成功処理 
- ❌ エラー詳細
- ⏳ 進捗状況

## 開発・テスト

### テスト実行
```bash
# 3社限定テスト
npm run test:automation

# カスタムテスト
curl "http://localhost:3000/api/cron/sales-automation?test=true&max=5"
```

### デバッグ
- `testMode=true`: 実際の保存を行わないテストモード
- 詳細ログ出力でフロー確認可能
- エラー時の自動フォールバック機能

## 注意事項

### API制限
- **DataForSEO**: レート制限に注意（3秒間隔）
- **Brave Search**: 月間クエリ制限を確認
- **Gemini**: 使用量モニタリング推奨

### データ品質
- 信頼度60%未満のデータは保存されません
- 重複は完全にブロックされます  
- 不正なフォーマットのデータは自動除外

### プライバシー
- 収集データは営業目的のみに使用
- 個人情報保護に留意した設計
- ログには機密情報を含めない

## ライセンス

MIT License - 詳細は`LICENSE`ファイルを参照してください。
