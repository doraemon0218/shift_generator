#!/bin/bash
echo "=========================================="
echo "  手術室シフト管理システム デモ"
echo "=========================================="
echo ""
echo "サーバーを起動しています..."
echo ""

cd "$(dirname "$0")"

# 既存のサーバーを停止
lsof -ti:8000 | xargs kill -9 2>/dev/null
sleep 1

# サーバーを起動
python3 -m http.server 8000 > /dev/null 2>&1 &
SERVER_PID=$!

sleep 2

echo "✅ サーバーが起動しました！"
echo ""
echo "【アクセスURL】"
echo "  http://localhost:8000/index.html"
echo ""
echo "【デモ用アカウント】"
echo "  管理者:"
echo "    姓: 山田 / 名: 太郎"
echo "    Gmail: yamada@example.com"
echo "    パスワード: password123"
echo ""
echo "  看護師:"
echo "    姓: 佐藤 / 名: 花子"
echo "    Gmail: sato@example.com"
echo "    パスワード: password456"
echo ""
echo "【サーバーを停止するには】"
echo "  Ctrl+C を押すか、以下のコマンドを実行:"
echo "  kill $SERVER_PID"
echo ""
echo "=========================================="

# Ctrl+Cでサーバーを停止
trap "kill $SERVER_PID 2>/dev/null; echo ''; echo 'サーバーを停止しました。'; exit" INT TERM

# サーバーが起動している間待機
wait $SERVER_PID
