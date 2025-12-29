import { Resend } from "resend";
import { DiffAnalysisResult } from "./diff-analyzer";
import { CompetitorAnalysisSummary } from "./competitor-analysis";
import { LLMDiffAnalysisResult } from "./llm-diff-analyzer";
import { routing } from '@/src/i18n/routing';

// 多言語対応用のメッセージ（サーバーサイド用）
const messages: Record<string, Record<string, any>> = {
  ja: {
    notification: {
      email: {
        subject: "【ReRank AI】順位下落を検知しました",
        subjectMultiple: "【ReRank AI】順位下落を検知しました（{count}件の記事）",
        header: "ReRank AI - 順位下落検知レポート",
        targetArticle: "📄 分析対象記事",
        targetKeywords: "🔍 分析対象キーワード",
        competitorArticles: "🏆 競合記事（{count}件）",
        whyCompetitorsRankHigher: "🔍 なぜ競合が上位なのか",
        missingContent: "❌ 不足している内容（{count}個）",
        recommendedAdditions: "✨ 追加すべき項目",
        section: "📝 {section}",
        reason: "理由",
        referenceCompetitorSites: "参考: この内容が記載されている競合サイト",
        footer: "ReRank AI - 順位下落の防止から上位への引き上げまで",
        rankChange: "{from}位 → {to}位（{change}位下落）",
        rankRise: "{from}位 → {to}位（{change}位上昇）",
        keyword: "キーワード",
        rank: "順位",
        itemsToAdd: "追加すべき項目",
        viewDetails: "詳細はダッシュボードで確認",
        viewDashboard: "ダッシュボードを表示",
        viewCompetitorsAndRecommendations: "競合サイトと改善案を確認",
        viewRankChangeDetails: "順位変動の詳細を確認",
        rankRiseCongratulations: "順位上昇しています！おめでとうございます。",
      },
    },
  },
  en: {
    notification: {
      email: {
        subject: "[ReRank AI] Rank drop detected",
        subjectMultiple: "[ReRank AI] Rank drop detected ({count} articles)",
        header: "ReRank AI - Rank Change Detection Report",
        targetArticle: "📄 Target Article",
        targetKeywords: "🔍 Target Keywords",
        competitorArticles: "🏆 Competitor Articles ({count})",
        whyCompetitorsRankHigher: "🔍 Why competitors rank higher",
        missingContent: "❌ Missing Content ({count} items)",
        recommendedAdditions: "✨ Recommended Additions",
        section: "📝 {section}",
        reason: "Reason",
        referenceCompetitorSites: "Reference: Competitor sites with this content",
        footer: "ReRank AI - From preventing ranking drops to boosting rankings",
        rankChange: "{from} → {to} ({change} drop)",
        rankRise: "{from} → {to} ({change} rise)",
        keyword: "Keyword",
        rank: "Rank",
        itemsToAdd: "Items to Add",
        viewDetails: "View details in dashboard",
        viewDashboard: "View Dashboard",
        viewCompetitorsAndRecommendations: "View Competitors & Recommendations",
        viewRankChangeDetails: "View Rank Change Details",
        rankRiseCongratulations: "Your rank has improved! Congratulations!",
      },
    },
  },
};

function getMessage(locale: string, key: string, params?: Record<string, string | number>): string {
  const localeMessages = messages[locale] || messages.ja;
  const keys = key.split('.');
  let value: any = localeMessages;
  for (const k of keys) {
    value = value?.[k];
  }
  if (typeof value !== 'string') {
    return key;
  }
  if (params) {
    return Object.entries(params).reduce((str, [k, v]) => str.replace(`{${k}}`, String(v)), value);
  }
  return value;
}

export interface NotificationOptions {
  to: string;
  subject?: string;
  siteUrl: string;
  pageUrl: string;
  analysisResult: CompetitorAnalysisSummary;
  locale?: string; // 多言語対応用（'ja' | 'en'）
}

export interface BulkNotificationItem {
  articleUrl: string;
  articleTitle?: string | null;
  articleId?: string; // 記事詳細ページへのリンク用
  analysisResult?: CompetitorAnalysisSummary;
  rankDropInfo?: {
    baseAveragePosition: number;
    currentAveragePosition: number;
    dropAmount: number;
    droppedKeywords: Array<{
      keyword: string;
      position: number;
      impressions: number;
    }>;
  };
  rankRiseInfo?: {
    baseAveragePosition: number;
    currentAveragePosition: number;
    riseAmount: number;
    risenKeywords: Array<{
      keyword: string;
      position: number;
      impressions: number;
    }>;
  };
  notificationType: 'rank_drop' | 'rank_rise';
}

export interface BulkNotificationOptions {
  to: string;
  items: BulkNotificationItem[];
  locale?: string; // 多言語対応用（'ja' | 'en'）
}

/**
 * 通知機能クラス
 * 差分分析結果をメールで通知
 */
export class NotificationService {
  /**
   * 差分分析結果をメールで通知
   */
  async sendDiffAnalysisNotification(
    options: NotificationOptions
  ): Promise<void> {
    const { to, subject, siteUrl, pageUrl, analysisResult } = options;

    if (!process.env.RESEND_API_KEY) {
      console.warn("[Notification] RESEND_API_KEY is not set, skipping email notification");
      return;
    }

    // Resendインスタンスを遅延初期化（ビルド時のエラーを回避）
    const resend = new Resend(process.env.RESEND_API_KEY);

    const articleUrl = `${siteUrl}${pageUrl}`;
    const emailSubject = subject || `【ReRank AI】順位下落を検知: ${analysisResult.prioritizedKeywords[0]?.keyword || "記事分析"}`;

    // メール本文を生成
    const emailBody = this.formatEmailBody(articleUrl, analysisResult);

    try {
      const { data, error } = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || "ReRank AI <noreply@rerank.ai>",
        to: [to],
        subject: emailSubject,
        html: emailBody,
      });

      if (error) {
        console.error("[Notification] Failed to send email:", error);
        throw new Error(`Failed to send email: ${error.message}`);
      }

      console.log("[Notification] Email sent successfully:", data);
    } catch (error: any) {
      console.error("[Notification] Error sending email:", error);
      throw error;
    }
  }

  /**
   * メール本文をフォーマット
   */
  private formatEmailBody(
    articleUrl: string,
    analysisResult: CompetitorAnalysisSummary
  ): string {
    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #4F46E5; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
          .section { background: white; padding: 16px; margin-bottom: 16px; border-radius: 8px; border: 1px solid #e5e7eb; }
          .section-title { font-size: 18px; font-weight: bold; margin-bottom: 12px; color: #111827; }
          .keyword-item { padding: 8px; margin-bottom: 8px; background: #f3f4f6; border-radius: 4px; }
          .recommendation { padding: 12px; margin-bottom: 8px; background: #FEF3C7; border-left: 4px solid #F59E0B; border-radius: 4px; }
          .recommendation-title { font-weight: bold; color: #92400E; margin-bottom: 4px; }
          .url-list { list-style: none; padding: 0; }
          .url-list li { padding: 4px 0; color: #6B7280; font-size: 14px; }
          .footer { text-align: center; padding: 20px; color: #6B7280; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">ReRank AI - 順位下落検知レポート</h1>
          </div>
          <div class="content">
    `;

    // 記事URL
    html += `
      <div class="section">
        <div class="section-title">📄 分析対象記事</div>
        <p><a href="${articleUrl}" style="color: #4F46E5; text-decoration: none;">${articleUrl}</a></p>
      </div>
    `;

    // 主要キーワード
    if (analysisResult.prioritizedKeywords.length > 0) {
      html += `
        <div class="section">
          <div class="section-title">🔍 分析対象キーワード</div>
      `;
      analysisResult.prioritizedKeywords.forEach((kw) => {
        html += `
          <div class="keyword-item">
            <strong>${kw.keyword}</strong><br>
            <small>順位: ${kw.position.toFixed(1)}位 | インプレッション: ${kw.impressions} | クリック: ${kw.clicks}</small>
          </div>
        `;
      });
      html += `</div>`;
    }

    // 競合URL
    if (analysisResult.uniqueCompetitorUrls.length > 0) {
      html += `
        <div class="section">
          <div class="section-title">🏆 競合記事（${analysisResult.uniqueCompetitorUrls.length}件）</div>
          <ul class="url-list">
      `;
      analysisResult.uniqueCompetitorUrls.slice(0, 5).forEach((url) => {
        html += `<li>• <a href="${url}" style="color: #4F46E5; text-decoration: none;">${url}</a></li>`;
      });
      html += `</ul></div>`;
    }

      // 意味レベルの差分分析結果（優先）
      if (analysisResult.semanticDiffAnalysis) {
        const semantic = analysisResult.semanticDiffAnalysis;
        
        html += `
          <div class="section">
            <div class="section-title">🔍 なぜ競合が上位なのか</div>
            <p>${semantic.semanticAnalysis.whyCompetitorsRankHigher}</p>
          </div>
        `;

        if (semantic.semanticAnalysis.missingContent.length > 0) {
          html += `
            <div class="section">
              <div class="section-title">❌ 不足している内容（${semantic.semanticAnalysis.missingContent.length}個）</div>
              <ul class="list-disc list-inside space-y-1">
          `;
          semantic.semanticAnalysis.missingContent.forEach((content) => {
            html += `<li class="text-sm">${content}</li>`;
          });
          html += `</ul></div>`;
        }

        if (semantic.semanticAnalysis.recommendedAdditions.length > 0) {
          html += `
            <div class="section">
              <div class="section-title">✨ 追加すべき項目（${semantic.semanticAnalysis.recommendedAdditions.length}個）</div>
          `;
          semantic.semanticAnalysis.recommendedAdditions.forEach((rec) => {
            html += `
              <div class="recommendation">
                <div class="recommendation-title">📝 ${rec.section}</div>
                <p class="text-sm" style="color: #6B7280; margin-top: 4px;">理由: ${rec.reason}</p>
                <p class="text-sm" style="margin-top: 4px;">${rec.content}</p>
                ${rec.competitorUrls && rec.competitorUrls.length > 0 ? `
                  <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #E5E7EB;">
                    <p class="text-xs" style="color: #6B7280; font-weight: bold; margin-bottom: 4px;">参考: この内容が記載されている競合サイト</p>
                    <ul style="list-style: none; padding: 0; margin: 0;">
                      ${rec.competitorUrls.map((url: string) => `
                        <li style="margin-bottom: 4px;">
                          <a href="${url}" style="color: #4F46E5; text-decoration: none; font-size: 12px; word-break: break-all;" target="_blank">${url}</a>
                        </li>
                      `).join('')}
                    </ul>
                  </div>
                ` : ''}
              </div>
            `;
          });
          html += `</div>`;
        }

        // キーワード固有の分析
        if (semantic.keywordSpecificAnalysis.length > 0) {
          semantic.keywordSpecificAnalysis.forEach((kwAnalysis) => {
            html += `
              <div class="section">
                <div class="section-title">🔑 キーワード「${kwAnalysis.keyword}」の分析</div>
                <p class="text-sm mb-2"><strong>なぜ順位が下がったか:</strong> ${kwAnalysis.whyRankingDropped}</p>
                <div>
                  <strong>追加すべき項目:</strong>
                  <ul class="list-disc list-inside space-y-2 mt-2">
            `;
            kwAnalysis.whatToAdd.forEach((itemData: any) => {
              // 後方互換性: 文字列の場合とオブジェクトの場合に対応
              const item = typeof itemData === 'string' ? itemData : itemData.item;
              const competitorUrls = typeof itemData === 'object' && itemData.competitorUrls ? itemData.competitorUrls : [];
              
              html += `<li class="text-sm">${item}`;
              if (competitorUrls && competitorUrls.length > 0) {
                html += `
                  <div style="margin-left: 24px; margin-top: 4px;">
                    <p class="text-xs" style="color: #6B7280; font-weight: bold; margin-bottom: 4px;">参考: この項目が記載されている競合サイト</p>
                    <ul style="list-style: none; padding: 0; margin: 0;">
                      ${competitorUrls.map((url: string) => `
                        <li style="margin-bottom: 4px;">
                          <a href="${url}" style="color: #4F46E5; text-decoration: none; font-size: 12px; word-break: break-all;" target="_blank">${url}</a>
                        </li>
                      `).join('')}
                    </ul>
                  </div>
                `;
              }
              html += `</li>`;
            });
            html += `</ul></div></div>`;
          });
        }
      }
      // 基本的な差分分析結果（フォールバック）
      else if (analysisResult.diffAnalysis) {
        const diff = analysisResult.diffAnalysis;
      
      html += `
        <div class="section">
          <div class="section-title">📊 分析結果</div>
          <p><strong>自社記事の文字数:</strong> ${diff.ownArticle.wordCount.toLocaleString()}文字</p>
          <p><strong>競合記事の平均文字数:</strong> ${diff.wordCountDiff.average.toLocaleString()}文字</p>
          ${diff.wordCountDiff.diff > 0 ? `<p style="color: #DC2626;"><strong>文字数の差:</strong> +${diff.wordCountDiff.diff.toLocaleString()}文字（競合の方が多い）</p>` : ""}
        </div>
      `;

      // 不足している見出し
      if (diff.missingHeadings.length > 0) {
        html += `
          <div class="section">
            <div class="section-title">📝 不足している見出し（${diff.missingHeadings.length}個）</div>
        `;
        diff.missingHeadings.slice(0, 5).forEach((h) => {
          html += `
            <div style="padding: 8px; margin-bottom: 4px; background: #FEF3C7; border-radius: 4px;">
              <strong>H${h.level}:</strong> ${h.heading}<br>
              <small style="color: #6B7280;">競合記事${h.foundIn.length}件に含まれる</small>
            </div>
          `;
        });
        html += `</div>`;
      }

      // 推奨事項（箇条書き）
      if (diff.recommendations.length > 0) {
        html += `
          <div class="section">
            <div class="section-title">✨ 追加すべき項目（推奨事項）</div>
        `;
        diff.recommendations.forEach((rec) => {
          html += `
            <div class="recommendation">
              <div class="recommendation-title">${rec}</div>
            </div>
          `;
        });
        html += `</div>`;
      }
    }

    html += `
          </div>
          <div class="footer">
            <p>このメールは ReRank AI から自動送信されました。</p>
            <p>順位下落を検知した際に自動で通知されます。</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return html;
  }

  /**
   * まとめ通知を送信（複数の記事を1つのメールにまとめる）
   */
  async sendBulkNotification(options: BulkNotificationOptions): Promise<void> {
    const { to, items, locale = 'ja' } = options;

    console.log("[Notification] sendBulkNotification called:", {
      to,
      itemsCount: items.length,
      locale,
    });

    if (items.length === 0) {
      console.warn("[Notification] No items to send, skipping bulk notification");
      return;
    }

    if (!process.env.RESEND_API_KEY) {
      console.warn("[Notification] RESEND_API_KEY is not set, skipping email notification");
      throw new Error("RESEND_API_KEY is not set");
    }

    // Resendインスタンスを遅延初期化
    const resend = new Resend(process.env.RESEND_API_KEY);

    // 通知タイプに応じて件名を決定
    const hasRise = items.some(item => item.notificationType === 'rank_rise');
    const hasDrop = items.some(item => item.notificationType === 'rank_drop');
    
    let emailSubject: string;
    if (items.length === 1) {
      emailSubject = hasRise 
        ? (locale === 'ja' ? '【ReRank AI】順位上昇を検知しました' : '[ReRank AI] Rank rise detected')
        : getMessage(locale, 'notification.email.subject');
    } else {
      if (hasRise && hasDrop) {
        emailSubject = locale === 'ja' 
          ? `【ReRank AI】順位変動を検知しました（${items.length}件の記事）`
          : `[ReRank AI] Rank changes detected (${items.length} articles)`;
      } else if (hasRise) {
        emailSubject = locale === 'ja'
          ? `【ReRank AI】順位上昇を検知しました（${items.length}件の記事）`
          : `[ReRank AI] Rank rises detected (${items.length} articles)`;
      } else {
        emailSubject = getMessage(locale, 'notification.email.subjectMultiple', { count: items.length });
      }
    }

    console.log("[Notification] Email subject generated:", emailSubject);

    // メール本文を生成
    const emailBody = this.formatBulkEmailBody(items, locale);
    console.log("[Notification] Email body generated, length:", emailBody.length);

    try {
      const emailData = {
        from: process.env.RESEND_FROM_EMAIL || "ReRank AI <noreply@rerank.ai>",
        to: [to],
        subject: emailSubject,
        html: emailBody,
      };

      console.log("[Notification] Sending email via Resend:", {
        from: emailData.from,
        to: emailData.to,
        subject: emailData.subject,
        hasHtmlBody: !!emailData.html,
      });

      const { data, error } = await resend.emails.send(emailData);

      if (error) {
        console.error("[Notification] Failed to send bulk email:", {
          error: error.message,
          errorCode: (error as any).code,
          errorDetails: error,
        });
        throw new Error(`Failed to send bulk email: ${error.message}`);
      }

      console.log("[Notification] Bulk email sent successfully:", {
        id: data?.id,
        to,
      });
    } catch (error: any) {
      console.error("[Notification] Error sending bulk email:", {
        error: error.message,
        stack: error.stack,
        to,
        itemsCount: items.length,
      });
      throw error;
    }
  }

  /**
   * まとめ通知のメール本文をフォーマット
   */
  private formatBulkEmailBody(items: BulkNotificationItem[], locale: string): string {
    const t = (key: string, params?: Record<string, string | number>) => getMessage(locale, key, params);

    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #374151; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
          .rank-rise-info { background: #D1FAE5; padding: 12px; margin-bottom: 12px; border-left: 4px solid #10B981; border-radius: 4px; }
          .rank-rise-change { font-size: 16px; font-weight: bold; color: #065F46; }
          .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
          .article-section { background: white; padding: 16px; margin-bottom: 16px; border-radius: 8px; border: 1px solid #e5e7eb; }
          .article-title { font-size: 18px; font-weight: bold; margin-bottom: 12px; color: #111827; border-bottom: 2px solid #6b7280; padding-bottom: 8px; }
          .article-number { display: inline-block; background: #6b7280; color: white; padding: 4px 8px; border-radius: 4px; margin-right: 8px; font-size: 14px; }
          .rank-info { background: #FEF3C7; padding: 12px; margin-bottom: 12px; border-left: 4px solid #F59E0B; border-radius: 4px; }
          .rank-change { font-size: 16px; font-weight: bold; color: #92400E; }
          .keyword-list { margin-top: 12px; }
          .keyword-item { padding: 8px; margin-bottom: 8px; background: #f3f4f6; border-radius: 4px; }
          .recommendation { padding: 12px; margin-bottom: 8px; background: #FEF3C7; border-left: 4px solid #F59E0B; border-radius: 4px; }
          .recommendation-title { font-weight: bold; color: #92400E; margin-bottom: 4px; }
          .footer { text-align: center; padding: 20px; color: #6B7280; font-size: 12px; }
          .view-details-button { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">${t('notification.email.header')}</h1>
          </div>
          <div class="content">
    `;

    // appUrlの末尾にlocaleが含まれている場合は削除（汎用的に処理）
    // 設定されているすべてのlocaleに対応
    let appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.rerank-ai.com';
    const localePattern = routing.locales.join('|');
    appUrl = appUrl.replace(new RegExp(`\\/(${localePattern})\\/?$`, 'i'), '');

    // 各記事の情報を追加
    items.forEach((item, index) => {
      const { articleUrl, articleTitle, articleId, rankDropInfo, rankRiseInfo, notificationType } = item;
      const displayTitle = articleTitle || articleUrl;
      // riseAmountが負の値（順位が下がっている）場合は、isRiseをfalseにする
      // rankRiseInfoが存在してもriseAmountが負の値の場合は、rankDropInfoとして扱う
      const isRise = notificationType === 'rank_rise' && rankRiseInfo && rankRiseInfo.riseAmount > 0;
      // rankRiseInfoが存在するがriseAmountが負の値の場合は、rankDropInfoとして扱う
      const effectiveRankDropInfo = rankDropInfo || (rankRiseInfo && rankRiseInfo.riseAmount <= 0 ? {
        baseAveragePosition: rankRiseInfo.baseAveragePosition,
        currentAveragePosition: rankRiseInfo.currentAveragePosition,
        dropAmount: Math.abs(rankRiseInfo.riseAmount),
        droppedKeywords: [],
      } : null);
      const rankInfo = isRise ? rankRiseInfo : effectiveRankDropInfo;

      html += `
        <div class="article-section">
          <div class="article-title">
            <span class="article-number">${index + 1}</span>
            ${displayTitle}
          </div>
          <p style="margin-bottom: 12px;">
            <a href="${articleUrl}" style="color: #3b82f6; text-decoration: none; word-break: break-all;">${articleUrl}</a>
          </p>
          
          <!-- 順位情報 -->
          <div class="rank-info" style="background: ${isRise ? '#D1FAE5' : '#FEF3C7'}; border-left-color: ${isRise ? '#10B981' : '#F59E0B'};">
            <div class="rank-change" style="color: ${isRise ? '#065F46' : '#92400E'};">
              ${isRise && rankRiseInfo ? t('notification.email.rankRise', {
                from: rankRiseInfo.baseAveragePosition.toFixed(1),
                to: rankRiseInfo.currentAveragePosition.toFixed(1),
                change: rankRiseInfo.riseAmount.toFixed(1),
              }) : effectiveRankDropInfo ? t('notification.email.rankChange', {
                from: effectiveRankDropInfo.baseAveragePosition.toFixed(1),
                to: effectiveRankDropInfo.currentAveragePosition.toFixed(1),
                change: effectiveRankDropInfo.dropAmount.toFixed(1),
              }) : ''}
            </div>
            ${isRise ? `
              <div style="margin-top: 8px; font-size: 14px; color: #065F46; font-weight: 500;">
                ${t('notification.email.rankRiseCongratulations')}
              </div>
            ` : ''}
          </div>

          <!-- キーワード情報 -->
          ${isRise && rankRiseInfo && rankRiseInfo.risenKeywords.length > 0 ? `
            <div class="keyword-list">
              <strong>${t('notification.email.keyword')}:</strong>
              ${rankRiseInfo.risenKeywords.slice(0, 3).map((kw) => `
                <div class="keyword-item">
                  <strong>${kw.keyword}</strong><br>
                  <small>${t('notification.email.rank')}: ${kw.position.toFixed(1)} | Impressions: ${kw.impressions.toLocaleString()}</small>
                </div>
              `).join('')}
            </div>
          ` : effectiveRankDropInfo && effectiveRankDropInfo.droppedKeywords.length > 0 ? `
            <div class="keyword-list">
              <strong>${t('notification.email.keyword')}:</strong>
              ${effectiveRankDropInfo.droppedKeywords.slice(0, 3).map((kw) => `
                <div class="keyword-item">
                  <strong>${kw.keyword}</strong><br>
                  <small>${t('notification.email.rank')}: ${kw.position.toFixed(1)} | Impressions: ${kw.impressions.toLocaleString()}</small>
                </div>
              `).join('')}
            </div>
          ` : ''}

          <!-- ボタン -->
          ${item.articleId ? `
            <div style="margin-top: 16px; text-align: center;">
              ${(() => {
                const articleDetailUrl = isRise 
                  ? `${appUrl}/${locale}/dashboard/articles/${item.articleId}`
                  : `${appUrl}/${locale}/dashboard/articles/${item.articleId}?analyze=true`;
                return isRise ? `
                  <a href="${articleDetailUrl}" 
                     style="display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px;">
                    ${t('notification.email.viewRankChangeDetails')}
                  </a>
                ` : `
                  <a href="${articleDetailUrl}" 
                     style="display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px;">
                    ${t('notification.email.viewCompetitorsAndRecommendations')}
                  </a>
                `;
              })()}
            </div>
          ` : ''}
        </div>
      `;
    });

    html += `
          </div>
        </div>
      </body>
      </html>
    `;

    return html;
  }
}

