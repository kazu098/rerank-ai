import { Resend } from "resend";
import { DiffAnalysisResult } from "./diff-analyzer";
import { CompetitorAnalysisSummary } from "./competitor-analysis";
import { LLMDiffAnalysisResult } from "./llm-diff-analyzer";

export interface NotificationOptions {
  to: string;
  subject?: string;
  siteUrl: string;
  pageUrl: string;
  analysisResult: CompetitorAnalysisSummary;
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
}

