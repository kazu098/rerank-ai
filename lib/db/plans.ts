import { createSupabaseClient } from '@/lib/supabase';

import { Currency, StripePriceIds, getStripePriceId } from '@/lib/billing/currency';

export interface Plan {
  id: string;
  name: string;
  display_name: string;
  price_monthly: number; // 既存スキーマとの互換性のため残す（ソート用途のみ）
  prices: Record<string, number> | null; // 各通貨ごとの価格（JPYは円単位、USD/EUR/GBPはセント単位）
  max_articles: number | null; // NULLは無制限
  max_analyses_per_month: number | null; // NULLは無制限
  max_sites: number | null; // NULLは無制限
  max_concurrent_analyses: number;
  max_article_suggestions_per_month: number | null; // NULLは無制限
  analysis_history_days: number | null; // NULLは無制限
  features: Record<string, any> | null;
  stripe_price_ids: StripePriceIds | null; // 各通貨ごとのStripe Price ID
  created_at: string;
}

/**
 * プランの価格を指定通貨で取得
 * 固定為替レートによる計算をやめ、各通貨ごとに直接設定された価格を使用
 */
export function getPlanPrice(plan: Plan, currency: Currency): number {
  if (!plan.prices) {
    console.error(`[getPlanPrice] Plan ${plan.name} does not have prices set. Plan data:`, {
      id: plan.id,
      name: plan.name,
      prices: plan.prices,
      price_monthly: plan.price_monthly,
    });
    throw new Error(`Plan ${plan.name} does not have prices set`);
  }

  const price = plan.prices[currency];
  if (price === undefined || price === null) {
    console.error(`[getPlanPrice] Plan ${plan.name} does not have price for currency ${currency}. Available currencies:`, Object.keys(plan.prices));
    throw new Error(`Plan ${plan.name} does not have price for currency ${currency}`);
  }

  return price;
}

/**
 * プランのStripe Price IDを取得（通貨指定）
 */
export function getPlanStripePriceId(plan: Plan, currency: Currency): string | null {
  if (!plan.stripe_price_ids) {
    return null;
  }

  return getStripePriceId(plan.stripe_price_ids, currency);
}

/**
 * プラン名からプランを取得
 */
export async function getPlanByName(planName: string): Promise<Plan | null> {
  const supabase = createSupabaseClient();

  const { data, error } = await supabase
    .from('plans')
    .select('*, prices')
    .eq('name', planName)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(`Failed to get plan: ${error.message}`);
  }

  return data as Plan;
}

/**
 * プランIDからプランを取得
 */
export async function getPlanById(planId: string): Promise<Plan | null> {
  const supabase = createSupabaseClient();

  const { data, error } = await supabase
    .from('plans')
    .select('*, prices')
    .eq('id', planId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(`Failed to get plan: ${error.message}`);
  }

  return data as Plan;
}

/**
 * 全プランを取得
 */
export async function getAllPlans(): Promise<Plan[]> {
  const supabase = createSupabaseClient();

  const { data, error } = await supabase
    .from('plans')
    .select('*, prices')
    .order('price_monthly', { ascending: true });

  if (error) {
    throw new Error(`Failed to get plans: ${error.message}`);
  }

  return (data || []) as Plan[];
}

/**
 * Stripe Price IDからプランを検索
 */
export async function findPlanByStripePriceId(stripePriceId: string): Promise<Plan | null> {
  const supabase = createSupabaseClient();

  // 全プランを取得
  const { data: plans, error } = await supabase
    .from('plans')
    .select('*, prices');

  if (error) {
    throw new Error(`Failed to get plans: ${error.message}`);
  }

  if (!plans) {
    return null;
  }

  // stripe_price_ids JSONBから該当するPrice IDを検索
  for (const plan of plans) {
    if (plan.stripe_price_ids) {
      const priceIds = plan.stripe_price_ids as StripePriceIds;
      if (
        priceIds.usd === stripePriceId ||
        priceIds.jpy === stripePriceId ||
        priceIds.eur === stripePriceId ||
        priceIds.gbp === stripePriceId
      ) {
        return plan as Plan;
      }
    }
  }

  return null;
}

/**
 * プランの制限をチェック
 */
export function checkPlanLimit(
  plan: Plan,
  limitType: 'articles' | 'analyses' | 'sites' | 'concurrent_analyses' | 'article_suggestions'
): number | null {
  switch (limitType) {
    case 'articles':
      return plan.max_articles;
    case 'analyses':
      return plan.max_analyses_per_month;
    case 'sites':
      return plan.max_sites;
    case 'concurrent_analyses':
      return plan.max_concurrent_analyses;
    case 'article_suggestions':
      return plan.max_article_suggestions_per_month;
    default:
      return null;
  }
}

/**
 * プランが制限を超えているかチェック
 */
export function isPlanLimitExceeded(
  plan: Plan,
  limitType: 'articles' | 'analyses' | 'sites' | 'concurrent_analyses' | 'article_suggestions',
  currentUsage: number
): boolean {
  const limit = checkPlanLimit(plan, limitType);
  
  // NULL（無制限）の場合はfalse
  if (limit === null) {
    return false;
  }

  return currentUsage >= limit;
}

