/**
 * Slack通知送信機能
 */

import { routing } from '@/src/i18n/routing';

export interface SlackNotificationPayload {
  text: string;
  blocks?: Array<{
    type: string;
    text?: {
      type: string;
      text: string;
    };
    fields?: Array<{
      type: string;
      text: string;
    }>;
  } & Record<string, any>>; // その他のSlack Block Kitプロパティを許可
}

/**
 * Slack通知を送信（OAuth方式 - Bot Token使用）
 * @param botToken Slack Bot Token
 * @param channelId チャンネルIDまたはUser ID（DM送信の場合）
 * @param payload 通知内容
 */
export async function sendSlackNotificationWithBot(
  botToken: string,
  channelId: string,
  payload: SlackNotificationPayload
): Promise<void> {
  console.log('[Slack Notification] sendSlackNotificationWithBot called:', {
    channelId,
    hasText: !!payload.text,
    blocksCount: payload.blocks?.length || 0,
    botTokenPrefix: botToken?.substring(0, 10) + '...',
  });

  try {
    const requestBody = {
      channel: channelId,
      text: payload.text, // フォールバックテキスト
      blocks: payload.blocks,
    };

    console.log('[Slack Notification] Sending request to Slack API:', {
      url: 'https://slack.com/api/chat.postMessage',
      channel: channelId,
      textLength: payload.text?.length || 0,
      blocksCount: payload.blocks?.length || 0,
    });

    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    console.log('[Slack Notification] Slack API response status:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Slack Notification] Slack API HTTP error:', {
        status: response.status,
        statusText: response.statusText,
        errorText,
      });
      throw new Error(`Failed to send Slack notification: ${response.status} ${errorText}`);
    }

    const data = await response.json();

    console.log('[Slack Notification] Slack API response:', {
      ok: data.ok,
      error: data.error,
      ts: data.ts,
      channel: data.channel,
    });

    if (!data.ok) {
      console.error('[Slack Notification] Slack API error:', {
        error: data.error,
        response: data,
      });
      throw new Error(`Slack API error: ${data.error}`);
    }

    console.log('[Slack Notification] Slack notification sent successfully:', {
      channel: data.channel,
      ts: data.ts,
    });
  } catch (error: any) {
    console.error('[Slack Notification] Error sending notification with bot:', {
      error: error.message,
      stack: error.stack,
      channelId,
      hasPayload: !!payload,
    });
    throw error;
  }
}

/**
 * 順位下落通知をSlack形式に変換
 */
export function formatSlackRankDropNotification(
  articleUrl: string,
  articleTitle: string | null,
  keywords: Array<{
    keyword: string;
    from: number;
    to: number;
    change: number;
  }>,
  averagePositionChange: {
    from: number;
    to: number;
    change: number;
  },
  locale: 'ja' | 'en' = 'ja'
): SlackNotificationPayload {
  const messages = {
    ja: {
      title: '🔔 順位下落を検知しました',
      article: '📄 記事',
      keywords: '🔍 キーワード',
      averagePosition: '平均順位',
      positionChange: '順位変化',
      viewDetails: '詳細はダッシュボードで確認',
    },
    en: {
      title: '🔔 Rank drop detected',
      article: '📄 Article',
      keywords: '🔍 Keywords',
      averagePosition: 'Average Position',
      positionChange: 'Position Change',
      viewDetails: 'View details in dashboard',
    },
  };

  const t = messages[locale];

  // キーワードごとの順位変化をフォーマット
  // 順位を小数第2位で四捨五入してから差を計算
  const keywordFields = keywords.slice(0, 10).map((kw) => {
    const roundedFrom = Math.round(kw.from * 10) / 10;
    const roundedTo = Math.round(kw.to * 10) / 10;
    const roundedChange = roundedFrom - roundedTo; // 順位上昇の場合は負の値、下落の場合は正の値
    const changeDisplay = roundedChange >= 0 ? `+${roundedChange.toFixed(1)}` : roundedChange.toFixed(1);
    return {
      type: 'mrkdwn',
      text: `*${kw.keyword}*\n${roundedFrom.toFixed(1)}位 → ${roundedTo.toFixed(1)}位 (${changeDisplay}位)`,
    };
  });

  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: t.title,
      },
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*${t.article}*\n${articleTitle || articleUrl}`,
        },
        {
          type: 'mrkdwn',
          text: (() => {
            // 順位を小数第2位で四捨五入してから差を計算
            const roundedFrom = Math.round(averagePositionChange.from * 10) / 10;
            const roundedTo = Math.round(averagePositionChange.to * 10) / 10;
            const roundedChange = roundedFrom - roundedTo; // 順位上昇の場合は負の値、下落の場合は正の値
            const changeDisplay = roundedChange >= 0 ? `+${roundedChange.toFixed(1)}` : roundedChange.toFixed(1);
            return `*${t.averagePosition}*\n${roundedFrom.toFixed(1)}位 → ${roundedTo.toFixed(1)}位 (${changeDisplay}位)`;
          })(),
        },
      ],
    },
  ];

  // キーワードが1つ以上ある場合、キーワードセクションを追加
  if (keywordFields.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${t.keywords}*`,
      },
    });

    // キーワードを2列で表示（最大10個）
    for (let i = 0; i < keywordFields.length; i += 2) {
      const fields = [keywordFields[i]];
      if (i + 1 < keywordFields.length) {
        fields.push(keywordFields[i + 1]);
      }
      blocks.push({
        type: 'section',
        fields,
      });
    }
  }

  // ダッシュボードへのリンク（オプション）
  const dashboardUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://rerank-ai.com';
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `<${dashboardUrl}/dashboard|${t.viewDetails}>`,
    },
  });

  return {
    text: t.title, // フォールバックテキスト
    blocks,
  };
}

/**
 * 複数記事の順位下落通知をSlack形式に変換（まとめ通知）
 */
export function formatSlackBulkNotification(
  articles: Array<{
    url: string;
    title: string | null;
    articleId?: string;
    notificationType?: 'rank_drop' | 'rank_rise';
    averagePositionChange: {
      from: number;
      to: number;
      change: number;
    };
  }>,
  locale: 'ja' | 'en' = 'ja'
): SlackNotificationPayload {
  const messages = {
    ja: {
      title: '🔔 順位変動を検知しました（{count}件の記事）',
      article: '📄 記事',
      averagePosition: '平均順位',
      positionChange: '順位変化',
      viewRecommendations: '改善案を確認',
    },
    en: {
      title: '🔔 Rank change detected ({count} articles)',
      article: '📄 Article',
      averagePosition: 'Average Position',
      positionChange: 'Position Change',
      viewRecommendations: 'View recommendations',
    },
  };

  const t = messages[locale];

  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: t.title.replace('{count}', articles.length.toString()),
      },
    },
  ];

  // 各記事の情報を表示（最大10件）
  let appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.rerank-ai.com';
  // appUrlの末尾にlocaleが含まれている場合は削除（汎用的に処理）
  // 設定されているすべてのlocaleに対応
  const localePattern = routing.locales.join('|');
  appUrl = appUrl.replace(new RegExp(`\\/(${localePattern})\\/?$`, 'i'), '');
  articles.slice(0, 10).forEach((article) => {
    const isRise = article.notificationType === 'rank_rise';
    const articleUrl = article.articleId 
      ? (isRise 
          ? `${appUrl}/${locale}/dashboard/articles/${article.articleId}`
          : `${appUrl}/${locale}/dashboard/articles/${article.articleId}?analyze=true`)
      : article.url;
    
    // 順位を小数第2位で四捨五入してから差を計算
    const roundedFrom = Math.round(article.averagePositionChange.from * 10) / 10;
    const roundedTo = Math.round(article.averagePositionChange.to * 10) / 10;
    const roundedChange = roundedFrom - roundedTo; // 順位上昇の場合は負の値、下落の場合は正の値
    
    // 順位上昇の場合はマイナス表示、下落の場合はプラス表示
    const changeDisplay = isRise ? roundedChange.toFixed(1) : `+${roundedChange.toFixed(1)}`;
    
    blocks.push({
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*${t.article}*\n${article.title || article.url}`,
        },
        {
          type: 'mrkdwn',
          text: `*${t.averagePosition}*\n${roundedFrom.toFixed(1)}位 → ${roundedTo.toFixed(1)}位 (${changeDisplay}位)`,
        },
      ],
    } as any);
    
    // 記事ごとに「改善案を確認」リンクを追加
    if (article.articleId) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `<${articleUrl}|${t.viewRecommendations}>`,
        },
      } as any);
    }
  });

  if (articles.length > 10) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*他 ${articles.length - 10}件の記事で順位変動を検知しました*`,
      },
    });
  }

  return {
    text: t.title.replace('{count}', articles.length.toString()),
    blocks,
  };
}

