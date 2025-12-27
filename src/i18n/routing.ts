import { defineRouting } from 'next-intl/routing';
import { createNavigation } from 'next-intl/navigation';

export const routing = defineRouting({
  // サポートするすべてのロケール
  locales: ['ja', 'en'],
  
  // ロケールが一致しない場合に使用
  defaultLocale: 'ja',
});

// Next.jsのナビゲーションAPIのラッパー
// ルーティング設定を考慮したナビゲーション
export const { Link, redirect, usePathname, useRouter } =
  createNavigation(routing);

export type Locale = (typeof routing.locales)[number];

