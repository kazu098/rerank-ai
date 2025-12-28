/**
 * Slack チャネル一覧取得機能
 */

export interface SlackChannel {
  id: string;
  name: string;
  is_private: boolean;
  is_archived: boolean;
  is_member?: boolean;
}

/**
 * Slackチャネル一覧を取得
 * @param botToken Slack Bot Token
 * @returns チャネル一覧（パブリックチャネルとプライベートチャネル、アーカイブされていないもの）
 */
export async function getSlackChannels(botToken: string): Promise<SlackChannel[]> {
  try {
    console.log('[Slack Channels] Fetching channels from Slack API...');
    // conversations.listでパブリックチャネルとプライベートチャネルを取得
    const response = await fetch('https://slack.com/api/conversations.list', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        types: 'public_channel,private_channel', // パブリックとプライベートチャネル
        exclude_archived: true, // アーカイブ済みを除外
        limit: 1000, // 最大1000件
      }),
    });

    console.log('[Slack Channels] Slack API response status:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Slack Channels] HTTP error:', response.status, errorText);
      throw new Error(`Failed to fetch channels: ${response.status} ${errorText}`);
    }

    const data = await response.json();

    console.log('[Slack Channels] Slack API response:', {
      ok: data.ok,
      error: data.error,
      channelsCount: data.channels?.length || 0,
    });

    if (!data.ok) {
      console.error('[Slack Channels] Slack API error:', data.error);
      throw new Error(`Slack API error: ${data.error}`);
    }

    // チャネル情報を整形
    const channels: SlackChannel[] = (data.channels || []).map((channel: any) => ({
      id: channel.id,
      name: channel.name,
      is_private: channel.is_private || false,
      is_archived: channel.is_archived || false,
      is_member: channel.is_member,
    }));

    // 名前でソート
    channels.sort((a, b) => a.name.localeCompare(b.name));

    return channels;
  } catch (error: any) {
    console.error('[Slack Channels] Error fetching channels:', error);
    throw error;
  }
}

