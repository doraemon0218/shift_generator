# 手術室シフト管理システム - GitHubリポジトリ

## 📌 このリポジトリについて

このリポジトリは、看護師のシフト希望調査結果から公平な2交代制の手術室シフト表を自動生成するWebアプリケーションです。

## 🚀 すぐに使う

### 方法1: GitHub Pagesでアクセス（推奨）

1. このリポジトリの **Settings** → **Pages** で GitHub Pages を有効化
2. ブランチを `main`、フォルダを `/` に設定
3. デプロイ後、以下のURLでアクセス：

**👉 [トップページ](https://doraemon0218.github.io/shift_generator/top.html)**

### 方法2: ローカルで起動

```bash
# リポジトリをクローン
git clone https://github.com/doraemon0218/shift_generator.git

# ディレクトリに移動
cd shift_generator

# ローカルサーバーを起動
python3 -m http.server 8000
```

ブラウザで以下のURLにアクセス：

**👉 [http://localhost:8000/top.html](http://localhost:8000/top.html)**

## 📋 主な機能

- ✅ ログイン機能（姓・名・Gmail・パスワード）
- ✅ シフト希望入力（カレンダー形式）
- ✅ 締め切り管理
- ✅ 管理者機能（夜勤設定、提出状況確認、CSVエクスポート）
- ✅ シフト表自動生成（公平性を考慮）
- ✅ 個人設定

## 🔐 デモ用アカウント

### 管理者アカウント
- 姓: `山田` / 名: `太郎`
- Gmail: `yamada@example.com`
- パスワード: `password123`

### 看護師アカウント
- 姓: `佐藤` / 名: `花子`
- Gmail: `sato@example.com`
- パスワード: `password456`

## 📚 詳細ドキュメント

詳細な使い方は [README.md](./README.md) と [DEMO.md](./DEMO.md) を参照してください。

## 🔗 リンク

- **トップページ**: [top.html](./top.html)
- **ログインページ**: [login.html](./login.html)
- **管理者ページ**: [admin.html](./admin.html)
- **シフト希望入力**: [nurse_input.html](./nurse_input.html)

## 📄 ライセンス

このプロジェクトはオープンソースです。


