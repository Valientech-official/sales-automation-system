# VPS シリアルコンソール接続 & デプロイ手順

## 🔧 シリアルコンソール接続手順

### 1. XServerパネルからシリアルコンソール起動
```bash
# XServerパネル → VPSパネル → シリアルコンソール をクリック
# ブラウザで新しいタブが開きます
```

### 2. rootユーザーでログイン
```bash
# シリアルコンソールで以下を入力:
root
# パスワード入力:
Feer01081012
```

### 3. 基本的なシステム確認
```bash
# システム情報確認
uname -a
lsb_release -a

# 現在の稼働サービス確認
systemctl list-units --state=active | grep -E "(nginx|docker|n8n)"

# ディスク容量確認
df -h

# メモリ使用状況
free -h
```

## 🚀 Next.js アプリケーション デプロイ手順

### 4. 必要なソフトウェアのインストール
```bash
# システム更新
apt update && apt upgrade -y

# 必要パッケージインストール
apt install -y curl git nginx

# Node.js 18 インストール (未インストールの場合)
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs

# PM2 インストール
npm install -g pm2

# インストール確認
node --version
npm --version
pm2 --version
```

### 5. GitHubからプロジェクトクローン
```bash
# プロジェクトディレクトリ作成
mkdir -p /opt/sales-automation-system
cd /opt/sales-automation-system

# GitHubからクローン (事前にリポジトリをパブリックにするか、SSH鍵設定が必要)
git clone https://github.com/your-username/sales-automation-system.git .

# または、tarファイルでアップロード
# scp -r ./sales-automation-system root@210.131.211.98:/opt/
```

### 6. アプリケーションセットアップ
```bash
# 依存関係インストール
npm install --production

# 環境変数ファイル設定
cp .env.production .env.local
# 必要に応じて.env.localを編集

# アプリケーションビルド
npm run build:production
```

### 7. PM2でアプリケーション起動
```bash
# PM2でアプリケーション起動
pm2 start ecosystem.config.js --env production

# PM2設定保存
pm2 save

# システム起動時のPM2自動起動設定
pm2 startup systemd -u root --hp /root

# アプリケーション状態確認
pm2 status
pm2 logs sales-automation
```

### 8. Nginx設定更新
```bash
# 既存のNginx設定確認
cat /etc/nginx/sites-available/default

# 設定ファイルバックアップ
cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.backup

# 新しい設定を追加 (nginx-sales.confの内容を既存の設定に統合)
nano /etc/nginx/sites-available/default

# Nginx設定テスト
nginx -t

# Nginx再起動
systemctl reload nginx
```

### 9. ファイアウォール設定 (必要に応じて)
```bash
# UFWの状態確認
ufw status

# 必要なポート開放 (80, 443, 3001)
ufw allow 80
ufw allow 443
ufw allow 3001

# UFW有効化 (未有効の場合)
ufw --force enable
```

### 10. 動作確認
```bash
# アプリケーションが起動しているか確認
curl -I http://localhost:3001/sales/

# Nginx経由でアクセス確認
curl -I https://feer-n8n.xvps.jp/sales/

# PM2ログ確認
pm2 logs sales-automation --lines 50
```

## 📊 便利なコマンド集

### PM2関連
```bash
# アプリケーション再起動
pm2 restart sales-automation

# ログをリアルタイム表示
pm2 logs sales-automation --follow

# PM2プロセス監視
pm2 monit

# アプリケーション停止
pm2 stop sales-automation

# アプリケーション削除
pm2 delete sales-automation
```

### Nginx関連
```bash
# Nginx設定テスト
nginx -t

# Nginx再起動・リロード
systemctl restart nginx
systemctl reload nginx

# Nginxステータス確認
systemctl status nginx

# Nginxアクセスログ
tail -f /var/log/nginx/access.log

# Nginxエラーログ
tail -f /var/log/nginx/error.log
```

### システム監視
```bash
# システムリソース確認
htop
# または
top

# ディスク使用量
df -h

# ポート使用状況
netstat -tulpn | grep :3001
ss -tulpn | grep :3001

# プロセス確認
ps aux | grep node
```

## 🔧 トラブルシューティング

### アプリケーションが起動しない場合
```bash
# PM2ログ確認
pm2 logs sales-automation

# 手動でアプリケーション起動テスト
cd /opt/sales-automation-system
npm run start:production

# ポート3001が使用中の場合
lsof -i :3001
# または
kill -9 <PID>
```

### Nginxアクセスできない場合
```bash
# Nginx設定テスト
nginx -t

# Nginxエラーログ確認
tail -50 /var/log/nginx/error.log

# ファイアウォール確認
ufw status
```

## 🎯 デプロイ完了後のアクセスURL

- **n8n**: https://feer-n8n.xvps.jp/ (既存)
- **Sales Automation**: https://feer-n8n.xvps.jp/sales/ (新規追加)

## 📝 自動化スクリプト

全ての手順を自動化したい場合は、以下のコマンドで自動デプロイスクリプトを実行できます:

```bash
# デプロイスクリプトをサーバーにコピー後
chmod +x deploy.sh
./deploy.sh
```