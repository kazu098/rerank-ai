# GA4でLPのボタンクリックを確認する方法

LPで送っているイベントと、GA4での見方。

## 送信しているイベント

| 操作 | イベント名 | パラメータ |
|------|------------|------------|
| **順位を確認する** ボタン（フォーム送信） | `search` | `event_category`: try_before_signup<br>`event_label`: rank_check<br>`keyword_count`: キーワード数（1〜5） |
| **Googleアカウントで無料開始** ボタン | `cta_click` | `event_category`: engagement<br>`event_label`: google_start<br>`button_location`: hero / try_section_result / nav_desktop / nav_mobile |

## GA4での確認手順

### 1. レポートで見る（簡単）

1. GA4 管理画面 → **レポート** → **エンゲージメント** → **イベント**
2. 一覧から次のイベントを探す:
   - **search** … 「順位を確認する」のクリック数
   - **cta_click** … 「Googleアカウントで無料開始」のクリック数
3. イベント名をクリックすると、パラメータ（`event_category` など）も表示される

### 2. フィルタで絞る

- **順位を確認するだけ見たい**: イベント「search」を選択 → ディメンションで「イベントパラメータ」の `event_category` = `try_before_signup` を追加（他で `search` を送っていないなら「search」だけでも可）
- **どのボタンからのGoogle開始か**: イベント「cta_click」→ パラメータ `button_location` で hero / try_section_result / nav を区別できる

### 3. エクスプロレーションで見る

1. **探索** → **空の探索**（または「フリーフォーム」）
2. **ディメンション**: イベント名、`button_location`（カスタムディメンション登録済みなら）、日付
3. **指標**: イベント数
4. **フィルタ**: イベント名 = `search` または `cta_click`

### 4. カスタムディメンション（任意）

`button_location` や `keyword_count` を常時レポートで使いたい場合:

1. GA4 **管理** → **データ表示** → **カスタム定義** → **カスタムディメンション**
2. **新規作成** → ディメンション名「ボタン位置」、スコープ「イベント」、イベントパラメータ `button_location`
3. 同様に「検索キーワード数」で `keyword_count` を登録すると、search イベントをキーワード数別に集計できる

---

**補足**: イベントは gtag で送信しているため、レポートに反映されるまで最大24〜48時間かかることがあります。リアルタイムでは **レポート** → **リアルタイム** → **イベント名を最後に実行したユーザー** で送信確認できます。
