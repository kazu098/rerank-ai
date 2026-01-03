/**
 * シンプルなメモリキャッシュ実装
 * 本番環境ではRedisなどの外部キャッシュに移行することを推奨
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class SimpleCache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private maxSize: number = 1000; // 最大キャッシュエントリ数

  /**
   * キャッシュからデータを取得
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    // 有効期限をチェック
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * キャッシュにデータを保存
   * @param key キャッシュキー
   * @param data キャッシュするデータ
   * @param ttlSeconds 有効期限（秒）
   */
  set<T>(key: string, data: T, ttlSeconds: number = 3600): void {
    // 最大サイズを超える場合は、最も古いエントリを削除
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.cache.set(key, {
      data,
      expiresAt,
    });
  }

  /**
   * キャッシュからデータを削除
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * キャッシュをクリア
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * 期限切れのエントリを削除
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }
}

// シングルトンインスタンス
let cacheInstance: SimpleCache | null = null;

/**
 * キャッシュインスタンスを取得
 */
export function getCache(): SimpleCache {
  if (!cacheInstance) {
    cacheInstance = new SimpleCache();
    // 定期的に期限切れエントリをクリーンアップ（5分ごと）
    if (typeof setInterval !== 'undefined') {
      setInterval(() => {
        cacheInstance?.cleanup();
      }, 5 * 60 * 1000);
    }
  }
  return cacheInstance;
}

/**
 * キャッシュキーを生成
 */
export function generateCacheKey(prefix: string, ...parts: (string | number)[]): string {
  return `${prefix}:${parts.join(':')}`;
}

