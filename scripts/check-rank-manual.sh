#!/bin/bash

# ランキングチェックの手動実行スクリプト
# 新しい通知レコードを作成するために実行
# 使用方法:
#   ./scripts/check-rank-manual.sh
#   または
#   ./scripts/check-rank-manual.sh --dry-run

set -e

# 環境変数の読み込み
if [ -f .env.local ]; then
  set -a
  source .env.local
  set +a
elif [ -f .env ]; then
  set -a
  source .env
  set +a
fi

# CRON_SECRETの確認
if [ -z "$CRON_SECRET" ]; then
  echo "Error: CRON_SECRET environment variable is not set"
  exit 1
fi

# デフォルトのURL（開発環境）
URL="${API_URL:-http://localhost:3000}/api/cron/check-rank/test"

# パラメータの設定
PARAMS=""
if [ "$1" == "--dry-run" ]; then
  PARAMS="?dryRun=true"
  echo "Running in DRY RUN mode (notifications will not be created)"
fi

# APIリクエストの実行
echo "Sending request to: $URL$PARAMS"
echo ""

RESPONSE=$(curl -s -w "\n%{http_code}" -X GET \
  "$URL$PARAMS" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json")

# HTTPステータスコードを取得
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

# レスポンスの表示
echo "HTTP Status: $HTTP_CODE"
echo ""
echo "Response:"
echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"

# ステータスコードが200以外の場合はエラーとして終了
if [ "$HTTP_CODE" != "200" ]; then
  exit 1
fi

