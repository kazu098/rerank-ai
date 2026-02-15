---
title: "Ahrefs キーワード調査とReRank AIの使い分け【併用】役割分担を解説"
description: "AhrefsのKeywords Explorer（有料）とReRank AIの役割の違いを解説。Keywords Explorerの料金・機能、Googleキーワードプランナーでの無料代替方法と使い方、キーワード調査はAhrefs・順位メンテはReRankという併用パターンを紹介します。"
date: "2026-02-11"
category: "比較"
tags: ["Ahrefs", "キーワード調査", "Keywords Explorer", "Googleキーワードプランナー", "ReRank AI", "SEOツール"]
author: "ReRank AI"
image: "/blog-images/ahrefs-keyword-research-vs-rerank.png"
---

SEOでは「どのキーワードを狙うか」の調査と、「すでに書いた記事の順位を維持・改善する」メンテの両方が必要です。

Ahrefsのキーワード調査（Keywords Explorer）は前者に強く、ReRank AIは後者に特化しています。
この記事では、両者の役割と、併用するときの具体的な流れを解説します。

## この記事でわかること

- **Keywords Explorerは有料**であることと、料金プランの概要
- Googleキーワードプランナーで無料である程度できることと操作方法
- Ahrefs Keywords Explorerでできること（検索ボリューム・難易度・関連キーワード）
- ReRank AIがカバーする範囲（順位監視・改善案。キーワード調査は補助的）
- 「キーワード調査はAhrefs、順位メンテはReRank」の役割分担
- 併用する場合のワークフロー例

## 目次

1. [Ahrefs キーワード調査（Keywords Explorer）でできること｜有料・機能・料金](#keywords-explorer)
2. [Keywords Explorerの無料代替｜Googleキーワードプランナーでできること](#keyword-planner)
3. [ReRank AIでできること（キーワードまわり）](#rerank)
4. [役割分担の整理](#役割分担)
5. [併用する場合のワークフロー例](#ワークフロー)
6. [キーワード調査だけ欲しい場合・順位メンテだけ欲しい場合](#選び方)
7. [まとめ](#まとめ)
8. [関連記事](#関連記事)

<a id="keywords-explorer"></a>
## Ahrefs キーワード調査（Keywords Explorer）でできること｜有料・機能・料金

AhrefsのKeywords Explorerは、「Find Winning Keyword Ideas. At Scale.（勝てるキーワードを大量に見つける）」をコンセプトに、検索需要と競合の強さを調べる機能です。

<a href="https://ahrefs.com/keywords-explorer" target="_blank" rel="noopener noreferrer">Keywords Explorer（公式説明）</a>や<a href="https://app.ahrefs.com/keywords-explorer" target="_blank" rel="noopener noreferrer">app.ahrefs.com/keywords-explorer</a>（アプリ）からアクセスできますが、Keywords Explorerは無料では使えず、有料プランの契約が必要です（出典：<a href="https://ahrefs.com/pricing" target="_blank" rel="noopener noreferrer">Ahrefs Plans & pricing</a>）。

### Keywords Explorerは有料｜料金プランと概要

Keywords Explorerは、Ahrefsの有料プラン（Lite以上）に含まれています。

無料の「Ahrefs Webmaster Tools」ではKeywords Explorerは利用できず、キーワード調査には最低でもLiteプラン（月額129ドル相当・税込約1.9万円〜）が必要です。

![Ahrefsの料金プラン（Keywords ExplorerはLite以上に含まれる）](/blog-images/ahrefs-getting-started-pricing-plans.png)

※出典：<a href="https://ahrefs.com/pricing" target="_blank" rel="noopener noreferrer">Ahrefs Plans & pricing</a>

料金プランとKeywords Explorerの制限（2026年・公式情報）：

| プラン | 月額（目安） | キーワードリスト数 | Keywords Explorer |
|--------|--------------|--------------------|-------------------|
| **Lite** | 約1.9万円/月 | 50リスト | 利用可能 |
| **Standard** | 約3.8万円/月 | 100リスト | 利用可能。AI suggestions・keyword clusters・search intents を含む |
| **Advanced** | 約6.9万円/月 | 200リスト | 利用可能 |
| **Enterprise** | 要問い合わせ | 500リスト | 利用可能 |

年間払いにすると最大約17%割引されます。

Keywords Explorer単体での購入はできず、Ahrefsの有料プラン全体（Site Explorer、Rank Tracker、Site Auditなど）とセットになります。

### Keywords Explorerでできること（仕様の詳細・公式情報に基づく）

Keywords Explorerでは、主に3つの柱（<a href="https://ahrefs.com/keywords-explorer" target="_blank" rel="noopener noreferrer">公式サイト</a>参照）でキーワード調査を支援します。

1. キーワードの発見（Keyword mapping）

- **AIでシードキーワードを発想**：トピックを入力するだけでアイデアを生成
- **6種類のレポート**：関連クエリをさまざまな切り口で発見
- **プリセット・フィルター**：すぐ使えるプリセットや自分用フィルターで候補を絞り込み
- **キーワードクラスタリング**：Parent Topic（親トピック）や関連語で即座にグループ化。重複・ニアマッチをまとめて効率化。他ツールでは数時間かかるクラスタリングが数秒で完了

![Ahrefs Keywords Explorer キーワードの発見（Keyword mapping）](/blog-images/ahrefs-keyword-explorer-mapping.png)

2. キーワードの分析（Keyword analysis）

- **Keyword Index**：Ahrefsは約1100億キーワードを収録（フィルタ後約287億件表示、米国単体で約24億件、217の国・地域対応）
- **検索ボリューム（Search volume）**：12ヶ月平均の予測値やトレンド。国・地域別で検索量を確認可能
- **キーワード難易度（KD）**：上位10位に表示される難しさ（0〜100）。競合ページのバックリンク数から算出
- **トラフィックポテンシャル（Traffic Potential）**：1位を取った場合の月間流入数の目安。上位ページの実際のトラフィックから推定
- **Parent Topic**：より広いトピックを狙いながら、そのキーワードでランクインできるかを確認
- **SERP分析**：上位ページのバックリンク・トラフィック・トラフィック価値で「なぜ上位なのか」を分析。履歴からSERPの変動や検索意図の変化も確認可能
- **広告履歴**：過去の広告主から商業性の目安を把握
- **モバイル／デスクトップ別**：デバイス別の検索割合でコンテンツ戦略を調整

![Ahrefs Keywords Explorer キーワード分析画面（検索ボリューム・KD・トラフィックポテンシャル）](/blog-images/ahrefs-keyword-explorer-analysis.png)

3. キーワードのターゲティング（Keyword targeting）

- **Lowest DRフィルター**：競合の弱いキーワードを見つけ、上位表示されやすい「取りこぼし」を発見（Standard以上）
- **検索意図（Search intent）**：AIで数百キーワードの検索意図（情報型・商業型・ナビゲーション型など）を一括把握
- **SERP比較**：複数キーワードや時期のSERPを並べて比較し、意図の変化を確認
- **Content Gap**：現在の順位とキーワード候補を突き合わせ、新規ページ向け・改善向けのギャップを発見
- **キーワードリスト**：候補をリストで整理し、メトリクスを一括確認
- **Organic Share of Voice（SoV）**：ターゲットキーワードでどのドメイン・ページが検索流入を獲得しているかを可視化

![Ahrefs Keywords Explorer キーワードのターゲティング（Keyword targeting）](/blog-images/ahrefs-keyword-explorer-targeting.png)

その他

- **キーワードリスト数**：プランごとに上限あり（Lite 50、Standard 100、Advanced 200、Enterprise 500）
- **バッチ分析（Batch Analysis）**：複数URLをまとめて分析（Lite 200、Standard 500、Advanced 1,000 URL/レポート）

新規で記事を書くテーマを決めたり、どのキーワードをタイトル・見出しに含めるかを決めたりする段階では、Keywords Explorerのデータが非常に役立ちます。

ただし有料プランが前提であり、無料トライアルは提供されていません。

ReRank AIは、すでに決まったキーワードで記事の順位を監視し、下がったときに改善案を出すことに特化しており、Keywords Explorerのような「キーワードの探索・ボリューム・難易度の調査」は行いません。

<a id="keyword-planner"></a>
### Keywords Explorerの無料代替｜Googleキーワードプランナーでできること

Keywords Explorerと同様の「検索ボリューム・関連キーワード・競合性」を、無料である程度調査できるのが<a href="https://ads.google.com/intl/ja_jp/home/tools/keyword-planner/" target="_blank" rel="noopener noreferrer">Googleキーワードプランナー</a>（Keyword Planner）です。

Google広告に付随するツールで、広告出稿なしでも利用できます。
一方で、広告を一定額以上出稿していない場合は検索ボリュームが「10〜100」「100〜1,000」といった範囲表示になり、Keywords Explorerのように正確な数値は出ません。
それでも、キーワードの相対的な需要や関連候補を把握するには十分活用できます。

![Googleキーワードプランナー（キーワード選定ツールのトップページ）](/blog-images/google-keyword-planner.png)

#### Googleキーワードプランナーでできること（Keywords Explorerとの比較）

- **月間検索ボリューム**：範囲表示（広告出稿済みなら数値表示可能）
- **関連キーワード**：キーワードやURLを入力して関連候補を取得
- **競合性（低・中・高）**：上位表示の競争の激しさの目安
- **CPC（クリック単価）**：広告入札の目安から商業性を推測
- **キーワード予測**：予算を入力するとクリック数・表示回数の見込みを表示

Keywords Explorerにある「キーワード難易度（KD）」「トラフィックポテンシャル」「AIクラスタリング」「検索意図の一括分析」などはありませんが、記事テーマの選定やキーワードの絞り込みには活用できます。

#### 操作方法（詳細手順）

**1. Google広告アカウントを作成**

- <a href="https://ads.google.com/" target="_blank" rel="noopener noreferrer">Google広告</a>にアクセスし、Googleアカウントでログイン
- 「今すぐ始める」から広告アカウントを作成（キャンペーン作成はスキップしてかまいません）
- 支払い情報の入力が求められる場合がありますが、広告を配信しない限り課金されません

**2. キーワードプランナーにアクセス**

- Google広告の画面左上の「ツールと設定」（レンチアイコン）をクリック
- 「プランニング」内の「キーワードプランナー」を選択
- または、<a href="https://ads.google.com/aw/keywordplanner/home" target="_blank" rel="noopener noreferrer">キーワードプランナー直リンク</a>から直接開くこともできます

**3. 新しいキーワードを発見する（キーワード入力）**

- 「キーワードを取得」または「新しいキーワードを検索」を選択
- 「キーワードまたはフレーズを入力」欄に、調べたいテーマのキーワードを入力（例：ブログ 書き方）
- 「結果を取得」をクリック
- 表示される「キーワードのアイデア」で、関連キーワード・月間検索ボリューム・競合性を確認
- 必要なキーワードを選択して「プランに追加」し、後でCSVやGoogleスプレッドシートにエクスポート可能

**4. 競合サイトからキーワードを取得する（URL入力）**

- 同じ画面で「ウェブサイトを入力」欄に、競合記事や自サイトのURLを入力
- 「結果を取得」をクリック
- そのページに関連するキーワード候補が表示されます。記事のトピック拡張や見出し候補の参考にできます

**5. 検索ボリュームと予測データを確認**

- 「予測を取得」では、特定のキーワードリストを入力し、月間検索ボリューム・推定クリック数・推定表示回数を確認
- 地域・言語・検索ネットワーク（Google検索／検索パートナー）を指定して絞り込み可能
- エクスポートボタンでCSVやスプレッドシートに出力し、他のツールと組み合わせて分析できます

![Googleキーワードプランナー 検索ボリュームと予測データを確認](/blog-images/google-keyword-planner-volume-forecast.png)

**6. 無料範囲での注意点**

- 広告を出稿していない場合、検索ボリュームは範囲（例：1,000〜10,000）での表示です
- より正確な数値が必要な場合は、少額（例：月数千円）の広告を配信すると細かいデータが表示されます
- SEO目的のみなら範囲表示でも、キーワードの相対的な需要把握や候補の選定には十分利用できます

Ahrefsの予算が取れない場合は、Googleキーワードプランナーでキーワードを選定し、ReRank AIで順位監視・改善案を得る組み合わせがおすすめです。

<a id="rerank"></a>
## ReRank AIでできること（キーワードまわり）

ReRank AIでは、記事URLと、その記事で狙っているキーワードを登録します。

キーワードは「AhrefsやGoogleキーワードプランナーなどで決めたもの」をそのまま入力する形が一般的です。
キーワードの検索ボリューム・難易度の表示や、関連キーワードの提案機能はありません。

<div class="my-6 rounded-lg overflow-hidden border border-gray-200 bg-gray-100 aspect-video max-w-4xl" style="min-height: 280px;">
  <video class="w-full h-full object-contain" controls playsinline preload="auto" muted autoplay loop style="min-height: 280px;">
    <source src="/videos/demo-jp.mp4" type="video/mp4" />
    お使いのブラウザは動画の再生に対応していません。
  </video>
</div>

### 仕様の詳細（サービス仕様に基づく）

- **登録できるキーワード**：1記事あたり複数キーワードを登録可能。キーワードの「調査」は行わず、登録したキーワードについて順位の取得・監視・下落時の改善案のみを提供します。
- **順位の取得**：Google Search Console（GSC）連携により、登録したキーワードの順位を自動取得。GSCの検索パフォーマンスデータと同一のソースです。
- **順位監視**：登録記事・キーワードの変化を監視し、下落時にメール通知。監視記事数はプランにより3〜300記事まで。
- **改善案**：順位が下がったとき、上位表示されている競合ページを自動分析し、「何を足す・直すか」を1件ずつテキストで提案。リライトのヒントとして利用できます。

![ReRank AIの監視記事一覧](/blog-images/monitoring-article-list.png)

![ReRank AIのメール通知例](/blog-images/monitoring-email-notification.png)

![ReRank AIの改善案画面](/blog-images/getting-started-article-revise.png)

つまり、キーワードを「探す」のはAhrefs、「決めたキーワードで記事のパフォーマンスを見て直す」のはReRank AIという分担になります。

<a id="役割分担"></a>
## 役割分担の整理

| フェーズ | Ahrefs（Keywords Explorer） | ReRank AI |
|----------|-----------------------------|-----------|
| テーマ・キーワードを決める | 検索ボリューム・難易度・関連キーワードを調査 | 特になし（既存記事のキーワードを登録するだけ） |
| 記事を書く | データを参考に構成・見出しを設計 | 特になし |
| 公開後の監視・メンテ | 順位はRank Trackerで確認可能（手動） | 自動監視＋下落時に通知・改善案 |

「キーワード調査はAhrefs、順位メンテはReRank」と分けておくと、ツールの使い分けが明確になります。

<a id="ワークフロー"></a>
## 併用する場合のワークフロー例

1. **Ahrefsでキーワード調査**  
   狙いたいキーワードをKeywords Explorerで選定（ボリューム・難易度・関連キーワードを確認）

2. **記事を執筆・公開**  
   選んだキーワードをタイトル・見出しに反映して記事を書く

3. **ReRank AIに記事とキーワードを登録**  
   公開した記事のURLと、Ahrefsで選んだキーワード（複数可）をReRank AIに登録し、監視を開始

4. **ReRank AIで自動監視・改善案を取得**  
   順位が下がったらメールやSlackで通知が届き、改善案を参照して記事を修正

5. **必要に応じてAhrefsで再調査**  
   大きな方向転換や新規キーワード追加を検討するときだけ、再度Keywords Explorerを使う

この流れにすると、調査はAhrefsに任せ、日々のメンテはReRankの通知と改善案に集中できます。

<a id="選び方"></a>
## キーワード調査だけ欲しい場合・順位メンテだけ欲しい場合

- **キーワード調査をがっつりやりたい**：Ahrefs Keywords Explorer（有料・Lite 約1.9万円/月〜）が向いています。料金の詳細は[Ahrefsが高い人向けの代替ツール・ReRank AI](/ja/blog/ahrefs-alternative-price)を参照してください。ReRank AIはキーワードの「調査」機能は限定的です。
- **すでに書いた記事の順位監視と改善案だけ欲しい**：ReRank AIだけで十分なことが多いです。キーワードは自分で決めて登録すればよいため、Ahrefsがなくても運用できます。

予算の都合でAhrefsを契約していない場合は、キーワード調査は[Googleキーワードプランナー（上記セクション参照）](#keyword-planner)やUbersuggest、GSCのクエリデータで補い、順位監視・改善案はReRank AIに任せる、という組み合わせも可能です。

<a id="まとめ"></a>
## まとめ

- **Ahrefs Keywords Explorer**：キーワードの検索ボリューム・難易度・関連キーワードの調査に強い。新規記事のテーマ決めやキーワード選定向き。
- **ReRank AI**：決めたキーワードで記事の順位を監視し、下落時に改善案を提案。記事メンテに特化。
- **併用**：「キーワード調査はAhrefs、順位メンテはReRank」にすると、役割がはっきりして運用しやすいです。

総合比較は[Ahrefs vs ReRank AI：違いと使い分け方](/ja/blog/ahrefs-comparison)で詳しく解説しています。

<a id="関連記事"></a>
## 関連記事

- [Ahrefs vs ReRank AI：違いと使い分け方](/ja/blog/ahrefs-comparison)（総合比較）
- [Ahrefs 順位監視（Rank Tracker）vs ReRank AI](/ja/blog/ahrefs-rank-tracker-vs-rerank)
- [Ahrefsが高い人向けの代替ツール・ReRank AI](/ja/blog/ahrefs-alternative-price)
- [Ahrefs バックリンク分析とReRankの位置づけ](/ja/blog/ahrefs-backlink-vs-rerank)
- [Ahrefs vs SEMrush：違いと選び方](/ja/blog/ahrefs-vs-semrush)
