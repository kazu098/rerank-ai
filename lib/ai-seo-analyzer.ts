import { ArticleContent } from "./article-scraper";

/**
 * AI SEO対策のチェック項目
 */
export interface AISEOCheckResult {
  hasFAQ: boolean; // FAQセクションがあるか
  hasSummary: boolean; // 「主なポイント」や要約セクションがあるか
  hasUpdateDate: boolean; // 更新日の表示があるか
  hasAuthorInfo: boolean; // 著者情報の明記があるか
  hasDataOrStats: boolean; // データ・統計の提示があるか
  hasStructuredData: boolean; // 構造化データ（JSON-LD）があるか
  hasQuestionHeadings: boolean; // 質問形式の見出しがあるか
  hasBulletPoints: boolean; // 箇条書きの活用があるか
  hasTables: boolean; // 表の活用があるか
}

/**
 * AI SEO対策の分析結果
 */
export interface AISEOAnalysisResult {
  ownArticle: AISEOCheckResult;
  competitorArticles: AISEOCheckResult[];
  missingElements: Array<{
    element: string; // 不足している要素名
    description: string; // 説明
    foundIn: string[]; // どの競合記事に含まれているか（URL）
    recommendation: string; // 改善提案
  }>;
  recommendations: string[]; // 箇条書きの推奨事項
}

/**
 * AI SEO分析クラス
 * LLM（AI Overview）に引用されやすいページの特徴をチェック
 */
export class AISEOAnalyzer {
  /**
   * 記事のAI SEO対策をチェック
   */
  checkAISEO(article: ArticleContent): AISEOCheckResult {
    const fullText = article.fullText.toLowerCase();
    const headingsText = article.headings.map(h => h.text.toLowerCase()).join(' ');

    return {
      hasFAQ: this.checkFAQ(article, fullText, headingsText),
      hasSummary: this.checkSummary(article, fullText, headingsText),
      hasUpdateDate: this.checkUpdateDate(article, fullText),
      hasAuthorInfo: this.checkAuthorInfo(article, fullText),
      hasDataOrStats: this.checkDataOrStats(article, fullText),
      hasStructuredData: article.hasStructuredData ?? false, // 記事スクレイパーで取得した構造化データの有無を使用
      hasQuestionHeadings: this.checkQuestionHeadings(article.headings),
      hasBulletPoints: article.lists.length > 0,
      hasTables: this.checkTables(article, fullText),
    };
  }

  /**
   * FAQセクションのチェック
   */
  private checkFAQ(article: ArticleContent, fullText: string, headingsText: string): boolean {
    // FAQ関連のキーワードをチェック
    const faqKeywords = [
      'よくある質問',
      'faq',
      'frequently asked',
      'q&a',
      'q and a',
      '質問',
      '疑問',
    ];

    // 見出しにFAQ関連のキーワードがあるか
    const hasFAQHeading = faqKeywords.some(keyword => 
      headingsText.includes(keyword)
    );

    // 本文にFAQ関連のキーワードがあるか
    const hasFAQContent = faqKeywords.some(keyword => 
      fullText.includes(keyword)
    );

    // 質問形式の見出しが複数あるか（FAQの可能性）
    const questionHeadings = article.headings.filter(h => 
      h.text.includes('?') || 
      h.text.includes('？') ||
      h.text.includes('とは') ||
      h.text.includes('どう') ||
      h.text.includes('なぜ') ||
      h.text.includes('何')
    );

    return hasFAQHeading || hasFAQContent || questionHeadings.length >= 3;
  }

  /**
   * 要約セクションのチェック
   */
  private checkSummary(article: ArticleContent, fullText: string, headingsText: string): boolean {
    const summaryKeywords = [
      '主なポイント',
      'まとめ',
      '要約',
      'summary',
      'key points',
      '要点',
      '結論',
      'conclusion',
      'サマリー',
    ];

    const hasSummaryHeading = summaryKeywords.some(keyword => 
      headingsText.includes(keyword)
    );

    const hasSummaryContent = summaryKeywords.some(keyword => 
      fullText.includes(keyword)
    );

    // 最初の段落が要約的な内容か（短く、要点をまとめている）
    const firstParagraph = article.paragraphs[0] || '';
    const isFirstParagraphSummary = firstParagraph.length < 300 && (
      firstParagraph.includes('本記事') ||
      firstParagraph.includes('この記事') ||
      firstParagraph.includes('まとめ') ||
      firstParagraph.includes('要約')
    );

    return hasSummaryHeading || hasSummaryContent || isFirstParagraphSummary;
  }

  /**
   * 更新日のチェック
   */
  private checkUpdateDate(article: ArticleContent, fullText: string): boolean {
    const dateKeywords = [
      '更新日',
      '更新',
      'updated',
      '最終更新',
      'last updated',
      '公開日',
      'published',
      '投稿日',
      '作成日',
      'created',
    ];

    // 日付パターン（YYYY-MM-DD, YYYY/MM/DD, YYYY年MM月DD日など）
    const datePatterns = [
      /\d{4}[-\/年]\d{1,2}[-\/月]\d{1,2}[日]?/,
      /\d{4}\.\d{1,2}\.\d{1,2}/,
    ];

    const hasDateKeyword = dateKeywords.some(keyword => 
      fullText.includes(keyword)
    );

    const hasDatePattern = datePatterns.some(pattern => 
      pattern.test(fullText)
    );

    return hasDateKeyword || hasDatePattern;
  }

  /**
   * 著者情報のチェック
   */
  private checkAuthorInfo(article: ArticleContent, fullText: string): boolean {
    const authorKeywords = [
      '著者',
      'author',
      '執筆者',
      'writer',
      '作成者',
      'creator',
      '監修',
      'supervisor',
      '編集',
      'editor',
    ];

    return authorKeywords.some(keyword => 
      fullText.includes(keyword)
    );
  }

  /**
   * データ・統計のチェック
   */
  private checkDataOrStats(article: ArticleContent, fullText: string): boolean {
    const dataKeywords = [
      '調査',
      'survey',
      'データ',
      'data',
      '統計',
      'statistics',
      '統計データ',
      'アンケート',
      '分析',
      'analysis',
      '結果',
      'results',
      '人に',
      '件',
      '%',
      'パーセント',
      '割合',
    ];

    // データを示す数値パターン（例：439人、2.7K、800件など）
    const dataPatterns = [
      /\d+[人人]/,
      /\d+[件個]/,
      /\d+[%％]/,
      /\d+\.\d+[KkMm]/,
      /\d+[割]/,
    ];

    const hasDataKeyword = dataKeywords.some(keyword => 
      fullText.includes(keyword)
    );

    const hasDataPattern = dataPatterns.some(pattern => 
      pattern.test(fullText)
    );

    // リストや表がある場合もデータの可能性
    const hasListsOrTables = article.lists.length > 0;

    return hasDataKeyword || hasDataPattern || hasListsOrTables;
  }

  /**
   * 質問形式の見出しのチェック
   */
  private checkQuestionHeadings(headings: ArticleContent['headings']): boolean {
    const questionIndicators = ['?', '？', 'とは', 'どう', 'なぜ', '何', 'どの', 'いつ', 'どこ', '誰'];
    
    return headings.some(h => 
      questionIndicators.some(indicator => h.text.includes(indicator))
    );
  }

  /**
   * 表のチェック
   */
  private checkTables(article: ArticleContent, fullText: string): boolean {
    // 表関連のキーワード
    const tableKeywords = [
      '表',
      'table',
      '比較表',
      '一覧',
      'リスト',
    ];

    // 実際のHTMLテーブルはパース時に検出する必要があるが、
    // ここではキーワードベースでチェック
    return tableKeywords.some(keyword => 
      fullText.includes(keyword)
    );
  }

  /**
   * 自社記事と競合記事を比較して、AI SEO対策の不足項目を検出
   */
  analyzeAISEO(
    ownArticle: ArticleContent,
    competitorArticles: ArticleContent[]
  ): AISEOAnalysisResult {
    const ownCheck = this.checkAISEO(ownArticle);
    const competitorChecks = competitorArticles.map(comp => 
      this.checkAISEO(comp)
    );

    // 不足している要素を検出
    const missingElements: AISEOAnalysisResult['missingElements'] = [];
    const recommendations: string[] = [];

    // 各チェック項目を比較
    const checkItems: Array<{
      key: keyof AISEOCheckResult;
      name: string;
      description: string;
      recommendation: string;
    }> = [
      {
        key: 'hasFAQ',
        name: 'FAQセクション',
        description: 'よくある質問に答えるセクション',
        recommendation: 'よくある質問（FAQ）セクションを追加し、ユーザーの疑問に直接答える形式にしてください。',
      },
      {
        key: 'hasSummary',
        name: '要約セクション',
        description: '「主なポイント」や要約セクション',
        recommendation: '記事の冒頭に「主なポイント」や要約セクションを追加し、最初から明確な回答を提供してください。',
      },
      {
        key: 'hasUpdateDate',
        name: '更新日の表示',
        description: '最新の更新日を示すタイムスタンプ',
        recommendation: '記事に更新日を明記し、情報の最新性を示してください。',
      },
      {
        key: 'hasAuthorInfo',
        name: '著者情報',
        description: '専門家の著者名の明記',
        recommendation: '記事に著者名や監修者名を明記し、専門性と信頼性を示してください。',
      },
      {
        key: 'hasDataOrStats',
        name: 'データ・統計',
        description: '独自データや統計の提示',
        recommendation: '調査結果や統計データを提示し、独自性と信頼性を高めてください。',
      },
      {
        key: 'hasQuestionHeadings',
        name: '質問形式の見出し',
        description: '質問形式の見出し構造',
        recommendation: '見出しを質問形式（例：「SEOの費用はいくらですか？」）にすることで、検索意図に直接応える構造にしてください。',
      },
      {
        key: 'hasBulletPoints',
        name: '箇条書き',
        description: '箇条書きの活用',
        recommendation: '情報を箇条書きで整理し、スキャンしやすく実務ですぐに役立つ内容にしてください。',
      },
      {
        key: 'hasTables',
        name: '表',
        description: '表の活用',
        recommendation: '比較表や一覧表を活用し、情報を視覚的に整理してください。',
      },
      {
        key: 'hasStructuredData',
        name: '構造化データ',
        description: '構造化データ（JSON-LD）の実装',
        recommendation: '構造化データ（JSON-LD）を実装することで、検索エンジンがコンテンツを理解しやすくなり、リッチスニペットの表示にも役立ちます。',
      },
    ];

    for (const item of checkItems) {
      if (!ownCheck[item.key]) {
        // 自社記事に不足している場合、競合記事で見つかったものを記録
        const foundIn: string[] = [];
        competitorChecks.forEach((compCheck, index) => {
          if (compCheck[item.key]) {
            foundIn.push(competitorArticles[index].url);
          }
        });

        if (foundIn.length > 0) {
          missingElements.push({
            element: item.name,
            description: item.description,
            foundIn,
            recommendation: item.recommendation,
          });

          recommendations.push(item.recommendation);
        }
      }
    }

    return {
      ownArticle: ownCheck,
      competitorArticles: competitorChecks,
      missingElements,
      recommendations,
    };
  }
}

